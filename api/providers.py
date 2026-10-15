from ..bot import (
    ClaudeCodeProvider,
    CodexCodeProvider,
    DeepSeekHarnessProvider,
    LocalLlmProvider,
    QwenCodeProvider,
    register_provider,
)
from ._common import app_path
from .settings import get_setting

register_provider(ClaudeCodeProvider(home_dir=app_path("bot-home")))
register_provider(CodexCodeProvider(home_dir=app_path("bot-home-codex")))
register_provider(QwenCodeProvider(home_dir=app_path("bot-home-qwen")))
register_provider(DeepSeekHarnessProvider(home_dir=app_path("bot-home-deepseek-harness")))
register_provider(LocalLlmProvider(base_url=lambda: str(get_setting("bot-local-llm-url"))))
