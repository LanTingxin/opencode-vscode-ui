import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { QuestionRequest } from "../../../core/sdk"
import { QuestionBlock } from "./docks"

function questionRequest(): Pick<QuestionRequest, "id" | "questions"> {
  return {
    id: "question-1",
    questions: [
      {
        header: "Target audience",
        question: "Who is the primary audience for this article?",
        options: [
          {
            label: "Programmers/developers",
            description: "Technical audience familiar with coding",
          },
          {
            label: "Business/management",
            description: "Decision-makers evaluating AI tools",
          },
        ],
      },
      {
        header: "Article tone",
        question: "What tone would you like for the article?",
        options: [
          {
            label: "Conversational/accessible",
            description: "Friendly and easy to understand",
          },
          {
            label: "Critical/balanced",
            description: "Examining both benefits and concerns",
          },
        ],
      },
    ],
  }
}

describe("QuestionBlock", () => {
  test("collapses answered questions to selected answers by default", () => {
    const html = renderToStaticMarkup(
      <QuestionBlock
        request={questionRequest()}
        mode="answered"
        answers={[
          ["Programmers/developers"],
          ["Conversational/accessible"],
        ]}
      />,
    )
    const showOptionsIndex = html.indexOf("Show options")
    const selectedDescriptionIndex = html.indexOf("Technical audience familiar with coding")

    assert.equal(html.includes("Programmers/developers"), true)
    assert.equal(html.includes("Conversational/accessible"), true)
    assert.equal(html.includes("Technical audience familiar with coding"), true)
    assert.equal(html.includes("Business/management"), false)
    assert.equal(html.includes("Critical/balanced"), false)
    assert.equal(html.includes("Selected answer"), false)
    assert.equal(html.includes("Show options"), true)
    assert.equal(showOptionsIndex > -1, true)
    assert.equal(selectedDescriptionIndex > -1, true)
    assert.equal(showOptionsIndex < selectedDescriptionIndex, true)
  })

  test("keeps unanswered questions expanded", () => {
    const html = renderToStaticMarkup(
      <QuestionBlock
        request={questionRequest()}
        mode="answered"
        answers={[
          [],
          ["Conversational/accessible"],
        ]}
      />,
    )

    assert.equal(html.includes("Business/management"), true)
    assert.equal(html.includes("No answer recorded."), true)
  })
})
