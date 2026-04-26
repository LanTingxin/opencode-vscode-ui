import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { toolTodosFromMetadata, defaultToolTitle } from "../panel/webview/lib/tool-meta"

describe("todowrite tool", () => {
  describe("todo item structure", () => {
    test("extracts todo with all required fields", () => {
      const metadata = {
        todos: [
          {
            content: "Implement feature X",
            status: "pending",
            priority: "high"
          }
        ]
      }

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 1)
      assert.equal(todos[0]?.content, "Implement feature X")
      assert.equal(todos[0]?.status, "pending")
    })

    test("validates and accepts all status values", () => {
      const metadata = {
        todos: [
          { content: "Task 1", status: "pending" },
          { content: "Task 2", status: "in_progress" },
          { content: "Task 3", status: "completed" },
          { content: "Task 4", status: "cancelled" }
        ]
      }

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 4)
      assert.equal(todos[0]?.status, "pending")
      assert.equal(todos[1]?.status, "in_progress")
      assert.equal(todos[2]?.status, "completed")
      assert.equal(todos[3]?.status, "cancelled")
    })

    test("defaults to pending status when status is missing", () => {
      const metadata = {
        todos: [
          { content: "Task without status" }
        ]
      }

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 1)
      assert.equal(todos[0]?.status, "pending")
    })

    test("filters out items without content", () => {
      const metadata = {
        todos: [
          { content: "Valid task", status: "pending" },
          { status: "pending" }, // No content
          { content: "", status: "pending" }, // Empty content
          { content: "Another valid task", status: "completed" }
        ]
      }

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 2)
      assert.equal(todos[0]?.content, "Valid task")
      assert.equal(todos[1]?.content, "Another valid task")
    })
  })

  describe("todo list operations", () => {
    test("handles empty todos array", () => {
      const metadata = { todos: [] }

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 0)
    })

    test("handles missing todos field", () => {
      const metadata = {}

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 0)
    })

    test("handles non-array todos field", () => {
      const metadata = { todos: "not an array" }

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 0)
    })

    test("filters out non-object items in todos array", () => {
      const metadata = {
        todos: [
          { content: "Valid task", status: "pending" },
          "invalid item",
          null,
          undefined,
          42,
          { content: "Another valid task", status: "completed" }
        ]
      }

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 2)
      assert.equal(todos[0]?.content, "Valid task")
      assert.equal(todos[1]?.content, "Another valid task")
    })
  })

  describe("todo state transitions", () => {
    test("tracks pending to in_progress transition", () => {
      const initialMetadata = {
        todos: [
          { content: "Task 1", status: "pending" }
        ]
      }

      const updatedMetadata = {
        todos: [
          { content: "Task 1", status: "in_progress" }
        ]
      }

      const initialTodos = toolTodosFromMetadata(initialMetadata)
      const updatedTodos = toolTodosFromMetadata(updatedMetadata)

      assert.equal(initialTodos[0]?.status, "pending")
      assert.equal(updatedTodos[0]?.status, "in_progress")
    })

    test("tracks in_progress to completed transition", () => {
      const initialMetadata = {
        todos: [
          { content: "Task 1", status: "in_progress" }
        ]
      }

      const updatedMetadata = {
        todos: [
          { content: "Task 1", status: "completed" }
        ]
      }

      const initialTodos = toolTodosFromMetadata(initialMetadata)
      const updatedTodos = toolTodosFromMetadata(updatedMetadata)

      assert.equal(initialTodos[0]?.status, "in_progress")
      assert.equal(updatedTodos[0]?.status, "completed")
    })

    test("tracks pending to cancelled transition", () => {
      const initialMetadata = {
        todos: [
          { content: "Task 1", status: "pending" }
        ]
      }

      const updatedMetadata = {
        todos: [
          { content: "Task 1", status: "cancelled" }
        ]
      }

      const initialTodos = toolTodosFromMetadata(initialMetadata)
      const updatedTodos = toolTodosFromMetadata(updatedMetadata)

      assert.equal(initialTodos[0]?.status, "pending")
      assert.equal(updatedTodos[0]?.status, "cancelled")
    })

    test("handles multiple todos with different states", () => {
      const metadata = {
        todos: [
          { content: "Task 1", status: "completed" },
          { content: "Task 2", status: "in_progress" },
          { content: "Task 3", status: "pending" },
          { content: "Task 4", status: "cancelled" }
        ]
      }

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 4)
      assert.equal(todos.filter(t => t.status === "completed").length, 1)
      assert.equal(todos.filter(t => t.status === "in_progress").length, 1)
      assert.equal(todos.filter(t => t.status === "pending").length, 1)
      assert.equal(todos.filter(t => t.status === "cancelled").length, 1)
    })
  })

  describe("todo rendering", () => {
    test("displays completion count in title when todos exist", () => {
      const metadata = {
        todos: [
          { content: "Task 1", status: "completed" },
          { content: "Task 2", status: "in_progress" },
          { content: "Task 3", status: "completed" },
          { content: "Task 4", status: "pending" }
        ]
      }

      const title = defaultToolTitle("todowrite", {}, metadata)

      assert.equal(title, "2/4")
    })

    test("displays 0/N when no todos are completed", () => {
      const metadata = {
        todos: [
          { content: "Task 1", status: "pending" },
          { content: "Task 2", status: "in_progress" }
        ]
      }

      const title = defaultToolTitle("todowrite", {}, metadata)

      assert.equal(title, "0/2")
    })

    test("displays N/N when all todos are completed", () => {
      const metadata = {
        todos: [
          { content: "Task 1", status: "completed" },
          { content: "Task 2", status: "completed" }
        ]
      }

      const title = defaultToolTitle("todowrite", {}, metadata)

      assert.equal(title, "2/2")
    })

    test("displays fallback message when no todos exist", () => {
      const metadata = { todos: [] }

      const title = defaultToolTitle("todowrite", {}, metadata)

      assert.equal(title, "Updating todos")
    })

    test("displays fallback message when todos field is missing", () => {
      const metadata = {}

      const title = defaultToolTitle("todowrite", {}, metadata)

      assert.equal(title, "Updating todos")
    })

    test("does not count cancelled todos in completion count", () => {
      const metadata = {
        todos: [
          { content: "Task 1", status: "completed" },
          { content: "Task 2", status: "cancelled" },
          { content: "Task 3", status: "pending" }
        ]
      }

      const title = defaultToolTitle("todowrite", {}, metadata)

      assert.equal(title, "1/3")
    })
  })

  describe("todo priority handling", () => {
    test("extracts todos regardless of priority field presence", () => {
      const metadata = {
        todos: [
          { content: "High priority task", status: "pending", priority: "high" },
          { content: "Medium priority task", status: "pending", priority: "medium" },
          { content: "Low priority task", status: "pending", priority: "low" }
        ]
      }

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 3)
      assert.equal(todos[0]?.content, "High priority task")
      assert.equal(todos[1]?.content, "Medium priority task")
      assert.equal(todos[2]?.content, "Low priority task")
    })
  })

  describe("edge cases", () => {
    test("handles todos with special characters in content", () => {
      const metadata = {
        todos: [
          { content: "Task with \"quotes\" and 'apostrophes'", status: "pending" },
          { content: "Task with <html> tags", status: "pending" },
          { content: "Task with emoji 🚀", status: "pending" }
        ]
      }

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 3)
      assert.equal(todos[0]?.content, "Task with \"quotes\" and 'apostrophes'")
      assert.equal(todos[1]?.content, "Task with <html> tags")
      assert.equal(todos[2]?.content, "Task with emoji 🚀")
    })

    test("handles very long todo content", () => {
      const longContent = "A".repeat(1000)
      const metadata = {
        todos: [
          { content: longContent, status: "pending" }
        ]
      }

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 1)
      assert.equal(todos[0]?.content, longContent)
    })

    test("handles todos with extra unknown fields", () => {
      const metadata = {
        todos: [
          {
            content: "Task 1",
            status: "pending",
            unknownField: "should be ignored",
            anotherField: 123
          }
        ]
      }

      const todos = toolTodosFromMetadata(metadata)

      assert.equal(todos.length, 1)
      assert.equal(todos[0]?.content, "Task 1")
      assert.equal(todos[0]?.status, "pending")
    })
  })
})
