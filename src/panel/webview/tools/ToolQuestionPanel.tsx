import React from "react"
import type { QuestionRequest } from "../../../core/sdk"
import type { ToolDetails, ToolPart } from "./types"

export function ToolQuestionPanel({
  QuestionBlock,
  ToolStatus,
  active = false,
  part,
  questionAnswerGroups,
  questionInfoList,
  toolDetails,
}: {
  QuestionBlock: ({ request, mode, answers }: { request: Pick<QuestionRequest, "id" | "questions">; mode: "active" | "answered"; answers?: string[][] }) => React.JSX.Element
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  active?: boolean
  part: ToolPart
  questionAnswerGroups: (value: unknown) => string[][]
  questionInfoList: (value: unknown) => QuestionRequest["questions"]
  toolDetails: (part: ToolPart) => ToolDetails
}) {
  const details = toolDetails(part)
  const answers = questionAnswerGroups(part.state?.metadata?.answers)
  const questions = questionInfoList(part.state?.input)
  const status = part.state?.status || "pending"

  return (
    <section className={`oc-part oc-part-tool oc-toolPanel${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      <div className="oc-partHeader">
        <div className="oc-toolHeaderMain">
          <span className="oc-kicker">questions</span>
          <span className="oc-toolPanelTitle">{details.title}</span>
        </div>
        <div className="oc-toolHeaderMeta">
          {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
          <ToolStatus state={part.state?.status} />
        </div>
      </div>
      {questions.length > 0 ? <QuestionBlock request={{ id: part.id, questions }} mode="answered" answers={answers} /> : answers.flat().length > 0 ? <div className="oc-toolAnswerList">{answers.flat().map((item) => <div key={item} className="oc-toolAnswerItem">{item}</div>)}</div> : null}
    </section>
  )
}
