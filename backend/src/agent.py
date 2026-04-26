from typing import TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.documents import Document
from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langgraph.graph import END, StateGraph

from src.rag_service import get_retriever

ASSESS_PROMPT = (
    "You are deciding how to respond to a student studying a business case.\n\n"
    "Given the retrieved context, conversation history, and the student's latest question, decide:\n"
    "- Return \"clarify\" if the question is ambiguous and a targeted clarifying question would help\n"
    "- Return \"socratic\" if you can guide the student toward insight with a Socratic response\n\n"
    "Respond with ONLY one word: \"clarify\" or \"socratic\"."
)

CLARIFY_PROMPT = (
    "You are a Socratic tutor helping a student analyze a business case.\n\n"
    "The student's question needs clarification before you can guide them well.\n"
    "Ask ONE focused, specific clarifying question. Do not answer the original question yet.\n\n"
    "Relevant context from the case:\n{context}"
)

SOCRATIC_PROMPT = (
    "You are a Socratic tutor helping a student analyze a business case.\n\n"
    "Guide the student toward insight through thoughtful questions and observations.\n"
    "Do NOT give direct answers — ask questions that help the student discover the insight themselves.\n"
    "Be concise and focused.\n\n"
    "Relevant context from the case:\n{context}"
)


class AgentState(TypedDict):
    input: str
    chat_history: list[BaseMessage]
    context: list[Document]
    assessment: str
    answer: str
    response_type: str


def _format_context(docs: list[Document]) -> str:
    return "\n\n".join(d.page_content for d in docs)


def build_graph(file_id: str):
    llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=1024)
    retriever = get_retriever(file_id)

    async def retrieve(state: AgentState) -> AgentState:
        docs = await retriever.ainvoke(state["input"])
        return {**state, "context": docs}

    async def assess(state: AgentState) -> AgentState:
        prompt = ChatPromptTemplate.from_messages([
            ("system", ASSESS_PROMPT),
            MessagesPlaceholder("chat_history"),
            ("human", "Context:\n{context}\n\nQuestion: {input}"),
        ])
        chain = prompt | llm
        result = await chain.ainvoke({
            "chat_history": state["chat_history"],
            "context": _format_context(state["context"]),
            "input": state["input"],
        })
        raw = result.content
        assessment = (raw if isinstance(raw, str) else "").strip().lower()
        if assessment not in ("clarify", "socratic"):
            assessment = "socratic"
        return {**state, "assessment": assessment}

    def route(state: AgentState) -> str:
        # Any non-clarify assessment (including the "socratic" fallback) routes to socratic_respond
        return "clarify" if state["assessment"] == "clarify" else "socratic_respond"

    async def clarify(state: AgentState) -> AgentState:
        prompt = ChatPromptTemplate.from_messages([
            ("system", CLARIFY_PROMPT),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ])
        chain = prompt | llm
        result = await chain.ainvoke({
            "context": _format_context(state["context"]),
            "chat_history": state["chat_history"],
            "input": state["input"],
        })
        return {**state, "answer": result.content, "response_type": "clarification"}

    async def socratic_respond(state: AgentState) -> AgentState:
        prompt = ChatPromptTemplate.from_messages([
            ("system", SOCRATIC_PROMPT),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ])
        chain = prompt | llm
        result = await chain.ainvoke({
            "context": _format_context(state["context"]),
            "chat_history": state["chat_history"],
            "input": state["input"],
        })
        return {**state, "answer": result.content, "response_type": "socratic_response"}

    builder = StateGraph(AgentState)
    builder.add_node("retrieve", retrieve)
    builder.add_node("assess", assess)
    builder.add_node("clarify", clarify)
    builder.add_node("socratic_respond", socratic_respond)
    builder.set_entry_point("retrieve")
    builder.add_edge("retrieve", "assess")
    builder.add_conditional_edges(
        "assess",
        route,
        {"clarify": "clarify", "socratic_respond": "socratic_respond"},
    )
    builder.add_edge("clarify", END)
    builder.add_edge("socratic_respond", END)
    return builder.compile()


async def run_agent(file_id: str, message: str, chat_history: list[BaseMessage]) -> dict:
    graph = build_graph(file_id)
    result = await graph.ainvoke({
        "input": message,
        "chat_history": chat_history,
        "context": [],
        "assessment": "",
        "answer": "",
        "response_type": "",
    })
    return {"answer": result["answer"], "response_type": result["response_type"]}
