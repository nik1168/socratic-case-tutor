import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from langchain_core.messages import AIMessage, HumanMessage

from src.agent import run_agent


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
    captured = {}

    async def capture_invoke(state, config=None):
        captured["config"] = config
        return {**state, "answer": "ok", "response_type": "socratic_response"}

    mock_graph = MagicMock()
    mock_graph.ainvoke = capture_invoke

    with patch("src.agent.build_graph", return_value=mock_graph):
        await run_agent("file-abc123", "Hello", [])

    config = captured["config"]
    assert isinstance(config, dict)
    assert config["metadata"]["file_id"] == "file-abc123"
    assert config["metadata"]["history_length"] == 0
    assert "case-tutor" in config["tags"]
    assert config["run_name"] == "chat-file-abc"
