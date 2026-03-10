import React from "react"
import type { PermissionRequest, QuestionInfo, QuestionRequest, SessionStatus } from "../../../core/sdk"
import type { AppState, FormState } from "./state"

export function PermissionDock(props: {
  request: PermissionRequest
  currentSessionID: string
  rejectMessage: string
  onRejectMessage: (value: string) => void
  onReply: (reply: "once" | "always" | "reject", message?: string) => void
}) {
  const { request, currentSessionID, rejectMessage, onRejectMessage, onReply } = props
  const childRequest = request.sessionID !== currentSessionID
  const info = permissionInfo(request)
  return (
    <section className="oc-dock oc-dock-warning">
      <div className="oc-dockHeader">
        <span className="oc-kicker">permission</span>
        <span className="oc-dockTitle">{info.label || "Approval required"}</span>
      </div>
      <div className="oc-dockText">{info.intro || "OpenCode is waiting for confirmation before it continues."}</div>
      <div className="oc-inlineValue">{info.title}</div>
      {info.details.length > 0 ? (
        <div className="oc-detailList">
          {info.details.map((item) => <div key={item} className="oc-dockText">{item}</div>)}
        </div>
      ) : null}
      {request.patterns?.length ? (
        <div className="oc-detailList">
          <div className="oc-patternRow">
            {info.patternTitle ? <div className="oc-help">{info.patternTitle}</div> : null}
            {request.patterns.map((item) => <span key={item} className="oc-pill">{item}</span>)}
          </div>
        </div>
      ) : null}
      {childRequest ? (
        <textarea
          className="oc-answerInput"
          value={rejectMessage}
          onChange={(event) => {
            const value = event.currentTarget.value
            onRejectMessage(value)
          }}
          placeholder="Optional instructions for the child session when rejecting"
        />
      ) : null}
      <div className="oc-actionRow">
        <button type="button" className="oc-btn" onClick={() => onReply("reject", childRequest ? rejectMessage.trim() || undefined : undefined)}>Reject</button>
        <button type="button" className="oc-btn" onClick={() => onReply("once")}>Allow once</button>
        <button type="button" className="oc-btn oc-btn-primary" onClick={() => onReply("always")}>Always allow</button>
      </div>
    </section>
  )
}

export function QuestionDock(props: {
  request: QuestionRequest
  form: FormState
  onOption: (index: number, label: string, multiple: boolean) => void
  onCustom: (index: number, value: string) => void
  onReject: () => void
  onSubmit: () => void
}) {
  const { request, form, onCustom, onOption, onReject, onSubmit } = props
  const meta = questionPromptInfo(request)
  const [tab, setTab] = React.useState(0)
  const total = request.questions.length
  const last = tab >= total - 1

  React.useEffect(() => {
    setTab(0)
  }, [request.id])

  const next = () => {
    if (last) {
      onSubmit()
      return
    }
    setTab((current) => Math.min(total - 1, current + 1))
  }

  const item = request.questions[tab]
  if (!item) {
    return null
  }

  return (
    <section className="oc-dock oc-dock-warning">
      <div className="oc-dockHeader">
        <span className="oc-kicker">question</span>
        <span className="oc-dockTitle">{meta.title}</span>
      </div>
      <div className="oc-dockText">{meta.text}</div>
      <QuestionBlock
        request={request}
        mode="active"
        form={form}
        tab={tab}
        onTab={setTab}
        onOption={onOption}
        onCustom={onCustom}
      />
      <div className="oc-actionRow">
        <button type="button" className="oc-btn" onClick={onReject}>Reject</button>
        <div className="oc-actionRow">
          {tab > 0 ? <button type="button" className="oc-btn" onClick={() => setTab((current) => Math.max(0, current - 1))}>Back</button> : null}
          <button type="button" className="oc-btn oc-btn-primary" onClick={next}>{last ? "Submit answers" : "Next question"}</button>
        </div>
      </div>
    </section>
  )
}

export function QuestionBlock(props: {
  request: Pick<QuestionRequest, "id" | "questions">
  mode: "active" | "answered"
  form?: FormState
  tab?: number
  onTab?: (index: number) => void
  onOption?: (index: number, label: string, multiple: boolean) => void
  onCustom?: (index: number, value: string) => void
  answers?: string[][]
}) {
  const { request, mode, form, tab = 0, onTab, onOption, onCustom, answers = [] } = props
  const items = mode === "active"
    ? request.questions.filter((_item, index) => index === tab)
    : request.questions

  return (
    <div className={`oc-question oc-question-${mode}`}>
      {mode === "active" && request.questions.length > 1 ? (
        <div className="oc-questionProgress" role="tablist" aria-label="Question progress">
          {request.questions.map((_item, index) => {
            const done = questionAnswers(request, index, form, answers).length > 0
            const active = index === tab
            return (
              <button
                key={`progress:${index}`}
                type="button"
                className={`oc-questionProgressItem${active ? " is-active" : ""}${done ? " is-done" : ""}`}
                onClick={() => onTab?.(index)}
                aria-label={`Question ${index + 1}`}
              />
            )
          })}
        </div>
      ) : null}
      <div className="oc-questionList">
        {items.map((item) => {
          const index = request.questions.indexOf(item)
          const current = questionAnswers(request, index, form, answers)
          const known = new Set(item.options.map((option) => option.label))
          const customAnswers = current.filter((answer) => !known.has(answer))
          return (
            <QuestionItem
              key={answerKey(request.id, index)}
              index={index}
              item={item}
              mode={mode}
              selected={current}
              custom={form ? form.custom[answerKey(request.id, index)] ?? "" : customAnswers.join("\n")}
              onOption={onOption}
              onCustom={onCustom}
            />
          )
        })}
      </div>
    </div>
  )
}

function QuestionItem(props: {
  index: number
  item: QuestionInfo
  mode: "active" | "answered"
  selected: string[]
  custom: string
  onOption?: (index: number, label: string, multiple: boolean) => void
  onCustom?: (index: number, value: string) => void
}) {
  const { index, item, mode, selected, custom, onOption, onCustom } = props
  const multiple = !!item.multiple
  const marker = (picked: boolean) => {
    if (multiple) {
      return picked ? "[x]" : "[ ]"
    }
    return picked ? "(*)" : "( )"
  }

  const known = new Set(item.options.map((option) => option.label))
  const customAnswers = selected.filter((answer) => !known.has(answer))
  const customValue = mode === "active" ? custom : customAnswers.join("\n")
  const customPicked = customAnswers.length > 0 || (mode === "active" && !!custom.trim())

  return (
    <section className="oc-questionCard">
      <div className="oc-questionItemHead">
        <div className="oc-inlineValue">{item.header || "Question"}</div>
        {mode === "answered" ? <span className="oc-questionState">{selected.length > 0 ? "answered" : "no answer"}</span> : null}
      </div>
      <div className="oc-questionPrompt">{item.question || ""}</div>
      {mode === "active" ? <div className="oc-questionHint">{multiple ? "Choose one or more answers." : "Choose one answer."}</div> : null}
      <div className="oc-questionOptions">
        {item.options.map((option) => {
          const picked = selected.includes(option.label)
          const body = (
            <>
              <span className="oc-questionMark" aria-hidden="true">{marker(picked)}</span>
              <span className="oc-questionOptionBody">
                <span className="oc-questionOptionLabel">{option.label}</span>
                {option.description ? <span className="oc-questionOptionDescription">{option.description}</span> : null}
              </span>
            </>
          )
          if (mode === "answered") {
            return <div key={option.label} className={`oc-questionOption${picked ? " is-selected" : ""}`}>{body}</div>
          }
          return (
            <button
              key={option.label}
              type="button"
              className={`oc-questionOption${picked ? " is-selected" : ""}`}
              onClick={() => onOption?.(index, option.label, multiple)}
            >
              {body}
            </button>
          )
        })}
        {item.custom === false ? null : mode === "answered" ? (
          customValue.trim() ? (
            <div className="oc-questionOption oc-questionOption-custom is-selected">
              <span className="oc-questionMark" aria-hidden="true">{marker(true)}</span>
              <span className="oc-questionOptionBody">
                <span className="oc-questionOptionLabel">Custom answer</span>
                <span className="oc-questionAnswerText">{customValue}</span>
              </span>
            </div>
          ) : null
        ) : (
          <label className={`oc-questionOption oc-questionOption-custom${customPicked ? " is-selected" : ""}`}>
            <span className="oc-questionMark" aria-hidden="true">{marker(customPicked)}</span>
            <span className="oc-questionOptionBody">
              <span className="oc-questionOptionLabel">Type your own answer</span>
              <textarea
                className="oc-answerInput oc-questionInput"
                value={custom}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  onCustom?.(index, value)
                }}
                placeholder="Optional custom answer"
                rows={Math.max(2, custom.split("\n").length || 2)}
              />
            </span>
          </label>
        )}
      </div>
      {mode === "answered" && selected.length === 0 ? <div className="oc-questionAnswerEmpty">No answer recorded.</div> : null}
    </section>
  )
}

export function RetryStatus({ status }: { status?: SessionStatus }) {
  const retry = status?.type === "retry" ? status : undefined
  const [seconds, setSeconds] = React.useState(() => retry?.next ? Math.max(0, Math.round((retry.next - Date.now()) / 1000)) : 0)

  React.useEffect(() => {
    if (!retry?.next) {
      setSeconds(0)
      return
    }

    const tick = () => setSeconds(Math.max(0, Math.round((retry.next - Date.now()) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [retry?.next])

  if (!retry) {
    return null
  }

  return (
    <section className="oc-dock oc-dock-error">
      <div className="oc-dockHeader">
        <span className="oc-kicker">retry</span>
        <span className="oc-dockTitle">Attempt #{retry.attempt}</span>
      </div>
      <div className="oc-dockText">{retry.message}</div>
      <div className="oc-help">Retrying {seconds > 0 ? `in ${formatDuration(seconds)} ` : ""}attempt #{retry.attempt}</div>
    </section>
  )
}

export function SessionNav(props: {
  navigation: AppState["snapshot"]["navigation"]
  onNavigate: (sessionID: string) => void
}) {
  const { navigation, onNavigate } = props
  if (!navigation.parent && !navigation.prev && !navigation.next) {
    return null
  }

  return (
    <section className="oc-dock">
      <div className="oc-dockHeader">
        <span className="oc-kicker">subagent</span>
        <span className="oc-dockTitle">Navigation</span>
      </div>
      <div className="oc-actionRow">
        {navigation.parent ? <button type="button" className="oc-btn" onClick={() => onNavigate(navigation.parent!.id)}>Parent</button> : null}
        {navigation.prev ? <button type="button" className="oc-btn" onClick={() => onNavigate(navigation.prev!.id)}>Prev</button> : null}
        {navigation.next ? <button type="button" className="oc-btn" onClick={() => onNavigate(navigation.next!.id)}>Next</button> : null}
      </div>
    </section>
  )
}

export function SubagentNotice() {
  return (
    <section className="oc-dock">
      <div className="oc-dockHeader">
        <span className="oc-kicker">subagent</span>
        <span className="oc-dockTitle">Read-only session</span>
      </div>
      <div className="oc-dockText">Upstream TUI hides the composer for child sessions. This tab follows that behavior.</div>
    </section>
  )
}

export function answerKey(requestID: string, index: number) {
  return `${requestID}:${index}`
}

type PermissionInfo = {
  label: string
  intro: string
  title: string
  details: string[]
  patternTitle?: string
}

function permissionInfo(request: PermissionRequest): PermissionInfo {
  const input = permissionInput(request)
  const details: string[] = []
  const base = {
    label: "Approval required",
    intro: "OpenCode is waiting for confirmation before it continues.",
  }

  if (request.permission === "edit") {
    const filepath = stringValue(request.metadata?.filepath)
    if (filepath) {
      details.push(`Path: ${filepath}`)
    }
    const diff = stringValue(request.metadata?.diff)
    if (diff) {
      details.push(diff)
    }
    return { ...base, title: `Edit ${filepath || "file"}`, details }
  }

  if (request.permission === "read") {
    const filePath = stringValue(input.filePath)
    return {
      ...base,
      title: `Read ${filePath || "file"}`,
      details: filePath ? [`Path: ${filePath}`] : details,
    }
  }

  if (request.permission === "glob" || request.permission === "grep") {
    const pattern = stringValue(input.pattern)
    return {
      ...base,
      title: `${capitalize(request.permission)} ${pattern ? `"${pattern}"` : "request"}`,
      details: pattern ? [`Pattern: ${pattern}`] : details,
    }
  }

  if (request.permission === "list") {
    const dir = stringValue(input.path)
    return {
      ...base,
      title: `List ${dir || "directory"}`,
      details: dir ? [`Path: ${dir}`] : details,
    }
  }

  if (request.permission === "bash") {
    const title = stringValue(input.description) || "Shell command"
    const command = stringValue(input.command)
    return {
      ...base,
      title,
      details: command ? [`$ ${command}`] : details,
    }
  }

  if (request.permission === "task") {
    const type = stringValue(input.subagent_type) || "Unknown"
    const description = stringValue(input.description)
    return {
      ...base,
      title: `${capitalize(type)} task`,
      details: description ? [description] : details,
    }
  }

  if (request.permission === "webfetch") {
    const url = stringValue(input.url)
    return {
      ...base,
      title: `WebFetch ${url || "request"}`,
      details: url ? [`URL: ${url}`] : details,
    }
  }

  if (request.permission === "websearch" || request.permission === "codesearch") {
    const query = stringValue(input.query)
    return {
      ...base,
      title: `${capitalize(request.permission)} ${query ? `"${query}"` : "request"}`,
      details: query ? [`Query: ${query}`] : details,
    }
  }

  if (request.permission === "external_directory") {
    const filepath = stringValue(request.metadata?.filepath)
    const parentDir = stringValue(request.metadata?.parentDir)
    const pattern = stringValue(request.patterns?.[0])
    const target = parentDir || filepath || pattern || "request"
    return {
      label: "Permission required",
      intro: "OpenCode wants to reach outside the current workspace before it continues.",
      title: `Access external directory ${target}`,
      details: parentDir && filepath && parentDir !== filepath ? [`Path: ${filepath}`] : [],
      patternTitle: request.patterns?.length ? "Patterns" : undefined,
    }
  }

  if (request.permission === "doom_loop") {
    return {
      label: "Permission required",
      intro: "OpenCode paused because the same failure pattern keeps repeating.",
      title: "Continue after repeated failures",
      details: ["This keeps the session running despite repeated failures."],
    }
  }

  return {
    ...base,
    title: `Call tool ${request.permission || "permission"}`,
    details,
  }
}

function permissionInput(request: PermissionRequest) {
  return request.metadata && typeof request.metadata === "object" ? request.metadata : {}
}

function questionPromptInfo(request: QuestionRequest) {
  const first = request.questions[0]
  if (request.questions.length === 1 && first && isPlanExitQuestion(first)) {
    return {
      title: "Build agent",
      text: "The plan is ready. Confirm whether OpenCode should switch back to build mode and start implementing.",
    }
  }
  return {
    title: "Answer required",
    text: "OpenCode needs your answer before it can continue.",
  }
}

function isPlanExitQuestion(question: QuestionInfo) {
  return question.header === "Build Agent"
    && question.custom === false
    && question.options.length === 2
    && question.options[0]?.label === "Yes"
    && question.options[1]?.label === "No"
    && question.question.includes("switch to the build agent")
}

function questionAnswers(request: Pick<QuestionRequest, "id" | "questions">, index: number, form?: FormState, answers: string[][] = []) {
  if (!form) {
    return answers[index] ?? []
  }
  const key = answerKey(request.id, index)
  const base = form.selected[key] ?? []
  const custom = (form.custom[key] ?? "").trim()
  return custom ? [...base, custom] : base
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function capitalize(value: string) {
  if (!value) {
    return ""
  }
  return value[0].toUpperCase() + value.slice(1)
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) {
    return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  if (remainMinutes > 0) {
    return `${hours}h ${remainMinutes}m`
  }
  return `${hours}h`
}
