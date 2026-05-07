import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.documents import Document
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableLambda

from src.agent import _format_context, build_graph, run_agent


def test_format_context_joins_page_contents():
    docs = [Document(page_content="First chunk"), Document(page_content="Second chunk")]
    assert _format_context(docs) == "First chunk\n\nSecond chunk"


def test_format_context_returns_empty_string_for_no_docs():
    assert _format_context([]) == ""


async def test_build_graph_executes_socratic_flow():
    responses = iter(["socratic", "What do you think drove their growth?"])

    async def mock_llm_fn(messages):
        return MagicMock(content=next(responses))

    mock_retriever = MagicMock()
    mock_retriever.ainvoke = AsyncMock(return_value=[Document(page_content="case context")])

    with patch("src.agent.ChatAnthropic", return_value=RunnableLambda(mock_llm_fn)), \
         patch("src.agent.get_retriever", return_value=mock_retriever):
        graph = build_graph("file-id")
        result = await graph.ainvoke({
            "input": "Why did they succeed?",
            "chat_history": [],
            "context": [],
            "assessment": "",
            "answer": "",
            "response_type": "",
        })

    assert result["response_type"] == "socratic_response"
    assert result["answer"] == "What do you think drove their growth?"
    assert result["assessment"] == "socratic"


async def test_build_graph_executes_clarify_flow():
    responses = iter(["clarify", "Can you be more specific?"])

    async def mock_llm_fn(messages):
        return MagicMock(content=next(responses))

    mock_retriever = MagicMock()
    mock_retriever.ainvoke = AsyncMock(return_value=[])

    with patch("src.agent.ChatAnthropic", return_value=RunnableLambda(mock_llm_fn)), \
         patch("src.agent.get_retriever", return_value=mock_retriever):
        graph = build_graph("file-id")
        result = await graph.ainvoke({
            "input": "Why?",
            "chat_history": [],
            "context": [],
            "assessment": "",
            "answer": "",
            "response_type": "",
        })

    assert result["response_type"] == "clarification"
    assert result["answer"] == "Can you be more specific?"


async def test_build_graph_assess_falls_back_to_socratic_on_invalid_llm_response():
    responses = iter(["neither_clarify_nor_socratic", "Here is a Socratic response."])

    async def mock_llm_fn(messages):
        return MagicMock(content=next(responses))

    mock_retriever = MagicMock()
    mock_retriever.ainvoke = AsyncMock(return_value=[])

    with patch("src.agent.ChatAnthropic", return_value=RunnableLambda(mock_llm_fn)), \
         patch("src.agent.get_retriever", return_value=mock_retriever):
        graph = build_graph("file-id")
        result = await graph.ainvoke({
            "input": "Tell me about this.",
            "chat_history": [],
            "context": [],
            "assessment": "",
            "answer": "",
            "response_type": "",
        })

    assert result["assessment"] == "socratic"
    assert result["response_type"] == "socratic_response"


async def test_run_agent_returns_socratic_response():
    fake_result = {
        "input": "Why did Airbnb succeed?",
        "chat_history": [],
        "context": [],
        "assessment": "socratic",
        "answer": "What factors do you think contributed most to their growth?",
        "response_type": "socratic_response",
    }
    mock_graph = MagicMock()
    mock_graph.ainvoke = AsyncMock(return_value=fake_result)

    with patch("src.agent.build_graph", return_value=mock_graph):
        result = await run_agent("file-001", "Why did Airbnb succeed?", [])

    assert result["response_type"] == "socratic_response"
    assert result["answer"] == "What factors do you think contributed most to their growth?"


async def test_run_agent_returns_clarification():
    fake_result = {
        "input": "Why did it fail?",
        "chat_history": [],
        "context": [],
        "assessment": "clarify",
        "answer": "Are you asking about the financial side or the operational side?",
        "response_type": "clarification",
    }
    mock_graph = MagicMock()
    mock_graph.ainvoke = AsyncMock(return_value=fake_result)

    with patch("src.agent.build_graph", return_value=mock_graph):
        result = await run_agent("file-001", "Why did it fail?", [])

    assert result["response_type"] == "clarification"
    assert result["answer"] == "Are you asking about the financial side or the operational side?"


async def test_run_agent_passes_chat_history():
    history = [HumanMessage(content="First question"), AIMessage(content="First answer")]
    captured = {}

    async def capture_invoke(state, config=None):
        captured["chat_history"] = state["chat_history"]
        return {**state, "answer": "ok", "response_type": "socratic_response"}

    mock_graph = MagicMock()
    mock_graph.ainvoke = capture_invoke

    with patch("src.agent.build_graph", return_value=mock_graph):
        await run_agent("file-001", "Follow-up", history)

    assert captured["chat_history"] == history
    assert isinstance(captured["chat_history"][0], HumanMessage)
    assert isinstance(captured["chat_history"][1], AIMessage)


async def test_run_agent_raises_value_error_for_unknown_file():
    with patch("src.agent.get_retriever", side_effect=ValueError("No index found for file_id: unknown")):
        with pytest.raises(ValueError, match="No index found"):
            await run_agent("unknown-file", "Hello", [])


async def test_run_agent_passes_runnable_config():
    file_id = "file-abc123"
    captured = {}

    async def capture_invoke(state, config=None):
        captured["config"] = config
        return {**state, "answer": "ok", "response_type": "socratic_response"}

    mock_graph = MagicMock()
    mock_graph.ainvoke = capture_invoke

    with patch("src.agent.build_graph", return_value=mock_graph):
        await run_agent(file_id, "Hello", [])

    config = captured["config"]
    assert isinstance(config, dict)
    assert config["metadata"]["file_id"] == file_id
    assert config["metadata"]["history_length"] == 0
    assert "case-tutor" in config["tags"]
    assert config["run_name"] == f"chat-{file_id[:8]}"
