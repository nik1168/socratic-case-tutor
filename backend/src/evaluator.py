import json
import logging
import re

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

EVALUATE_PROMPT = (
    "You are assessing the quality of a student's thinking about a business case.\n\n"
    "Given the conversation history and the student's latest message, classify their critical thinking.\n\n"
    "Respond with a JSON object and nothing else (no markdown, no code blocks):\n"
    '{"thinking_quality": "<value>", "feedback": "<one sentence>"}\n\n'
    '"thinking_quality" must be exactly one of:\n'
    '- "shallow": factual questions or surface observations with no analysis\n'
    '- "developing": some analytical thinking but ideas are not yet connected\n'
    '- "insightful": strong critical thinking, connecting concepts or exploring implications\n\n'
    '"feedback" must be one actionable sentence for the student.'
)


def _build_chain():
    llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=256)
    prompt = ChatPromptTemplate.from_messages([
        ("system", EVALUATE_PROMPT),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ])
    return prompt | llm


async def evaluate_message(message: str, chat_history: list[BaseMessage]) -> dict:
    chain = _build_chain()
    logging.warning("EVALUATOR invoking chain")
    try:
        result = await chain.ainvoke({
            "chat_history": chat_history,
            "input": message,
        })
    except Exception as exc:
        logging.warning("EVALUATOR ainvoke failed: %r", exc)
        return {"thinking_quality": "developing", "feedback": ""}
    logging.warning("EVALUATOR content type=%s repr=%r", type(result.content).__name__, repr(result.content)[:500])
    raw = result.content if isinstance(result.content, str) else ""
    # LLMs often wrap JSON in markdown fences despite instructions — extract the object
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        raw = match.group()
    logging.warning("EVALUATOR extracted raw=%r", raw[:200])
    try:
        parsed = json.loads(raw)
        thinking_quality = parsed.get("thinking_quality", "")
        feedback = parsed.get("feedback", "")
        if thinking_quality not in ("shallow", "developing", "insightful"):
            thinking_quality = "developing"
        if not isinstance(feedback, str):
            feedback = ""
        return {"thinking_quality": thinking_quality, "feedback": feedback}
    except (json.JSONDecodeError, AttributeError):
        return {"thinking_quality": "developing", "feedback": ""}
