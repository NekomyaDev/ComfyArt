# ComfyArt

[English](README.md) | 中文

[![ComfyArt 宣传片](docs/media/preview-zh.gif)](docs/media/promo-zh.mp4)

[观看完整宣传片（38 秒）](docs/media/promo-zh.mp4)

免费开源的 AI 设计画布，完全跑在你自己的 ComfyUI 上：无限画布（tldraw + React）、能用工具直接在画布上干活的设计 Agent，所有图像和视频模型都在本地运行。不用账号，不花积分，不上云。

## 安装

把本目录放进 `ComfyUI/custom_nodes/`，在 ComfyUI 的环境里装好 Python 依赖（`pip install -r requirements.txt`，目前只有 PDF 上传用的 `pypdfium2`），重启 ComfyUI 后打开 `http://127.0.0.1:8188/comfyart/`。构建好的页面在 `dist/`；改了 `src/` 之后用 `npm install && npm run build` 重新构建。

项目保存在 ComfyUI 用户目录的 `comfyart/projects/` 下。界面语言跟随 ComfyUI 的语言设置（中文或英文）。

## Agent

Agent 面板在后端运行一个真正会调用工具的 Agent，移植自 [ComfyTV](https://github.com/jtydhr88/ComfyTV) 的 bot。默认关闭：在「Agent 设置」里打开 MCP 和 Agent 即可。图像、视频模式不依赖它。每个对话可以单独选择 Agent：

| Agent | 需要什么 |
|---|---|
| Claude Code | PATH 里有 `claude` 且已登录 |
| Codex | PATH 里有 `codex` 且已登录 |
| Qwen Code | PATH 里有 `qwen`，并在 `~/.qwen/settings.json` 配好模型 |
| DeepSeek Harness | PATH 里有 `dsh`，并在 DeepSeek Harness 应用里登录 |
| Local LLM | 任意支持工具调用的 OpenAI 兼容端点（Agent 设置 → Local LLM 地址）；需要 key 时在启动 ComfyUI 前设置 `COMFYART_LOCAL_LLM_API_KEY` |

智能分镜、OCR、品牌和记忆提取、参考图说明、Ideogram 的结构化描述，都是对默认 Agent 的单次调用（`POST /comfyart/bot/complete`，不带工具）。ComfyArt 从不保存任何凭据。Agent 通过 `POST /comfyart/mcp` 上的 ComfyArt MCP 服务器干活（查看画布、生成和编辑图片视频、放置文字、形状、画板、网页和幻灯片、记忆、技能、向用户提问）。画布工具由该项目打开着的 ComfyArt 标签页执行，所以 Agent 工作时请保持页面打开。对话保存在 SQLite 数据库 `user/__comfyart/data.db` 里，关掉面板也会继续运行。

## 工作流和模型

画布上的每个操作都通过 ComfyUI 的 `/prompt` 运行 `workflows/` 里的某个 API 工作流。除特别注明外都只用核心节点。

| 操作 | 工作流 | 模型 / 自定义节点 |
|---|---|---|
| 图像生成、快捷编辑、编辑文字、扩图、评论改稿 | `qwen-image-2.1-t2i`、`edit-qwen-image-2.1`、`outpaint-qwen-image-2.1` | `qwen_image_2.1_int8_convrot.safetensors`、`qwen3vl_8b_int8_convrot.safetensors`、`qwen_image_2.1_vae_bf16.safetensors` |
| 图像生成（其他模型） | `z-image-turbo-t2i`、`flux2-klein-9b-t2i`、`qwen-image-2512-t2i`、`ideogram4-t2i` | `z_image_turbo_bf16` + `qwen_3_4b` + `ae`；`flux-2-klein-9b-nvfp4` + `qwen_3_8b_fp8mixed` + `flux2-vae`；`qwen_image_2512_fp8_e4m3fn` + `qwen_2.5_vl_7b_fp8_scaled` + `qwen_image_vae`（用 ComfyArt Precise UNET Loader 节点加载，见下文）；`ideogram4_fp8_scaled` + `ideogram4_unconditional_fp8_scaled` + `qwen3vl_8b_fp8_scaled` + `flux2-vae`，Ideogram 需要的结构化描述由默认 Agent 撰写（`ideogram4-caption.json`） |
| 参考模式（线稿、景深、姿势等） | 代码内构建 | [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux) 预处理器（MLSD、HED、法线和分割首次使用时会下载标注器权重）；配合 Qwen Image 2512 还需要 `Qwen-Image-2512-Fun-Controlnet-Union-2602.safetensors`（controlnet） |
| 语音输入 | `transcribe-gemma4` | `gemma4_e4b_it_fp8_scaled.safetensors`（text_encoders） |
| 放大 | `upscale-ultrasharp-4x` | `4x-UltraSharp.pth`（upscale_models） |
| 去背景 | `cutout-birefnet` | `birefnet.safetensors`（background_removal） |
| 橡皮工具 | `erase-lama` | [comfyui-inpaint-nodes](https://github.com/Acly/comfyui-inpaint-nodes)、`big-lama.pt` |
| 多角度 | `multiangle-qwen-image-2.1` | 上面的 Qwen Image 2.1 三个文件，外加 [`qwen-image-2.1-qma-camera-angles.safetensors`](https://huggingface.co/gribbliest/qwen-image-2.1-qma-camera-angles)（loras） |
| 图层拆分 | `layers-qwen-image-layered` | `qwen_image_layered_bf16.safetensors`、`qwen_image_layered_vae.safetensors`、`qwen_2.5_vl_7b_fp8_scaled.safetensors` |
| 动态图片、视频生成、视频延长 | `i2v-minimax-h3`、`t2v-minimax-h3` | `minimax_h3_fl2va_pruned_int8_convrot.safetensors`、`minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors`、`qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`、`minimax_h3_video_vae_fp16.safetensors`、`minimax_h3_audio_vae_fp32.safetensors` |
| 视频裁剪 | 代码内构建 | 只用核心节点 |

## 节点和路由

- `ComfyArt Precise UNET Loader` 用 manual cast 算子加载扩散模型。ComfyUI 的 `--fast fp8_matrix_mult` 会把 Qwen Image 2512 这类未缩放的 fp8 权重跑成噪点；这个加载器让它加载的模型绕开那条路径。
- `/comfyart/bot/*`（对话、发送、停止、分支、回答）、`/comfyart/settings` 和 `/comfyart/mcp` 服务于 Agent。
- `POST /comfyart/pdf` 把上传的 PDF 前 30 页渲染成 PNG，存到 `input/comfyart/pdf/`，并连同每页文字一起返回。

## 开发

`npm run dev` 启动 Vite，`/api` 代理到 `http://127.0.0.1:8188`（可用 `COMFY_URL` 覆盖）。

## 许可证

ComfyArt 采用 MIT 许可证。`bot/` 和 `api/` 里的 Agent 后端改编自 [ComfyTV](https://github.com/jtydhr88/ComfyTV) 的 bot（MIT），其中包括 Pengjingyu1992（DeepSeek Harness、Local LLM、Codex）、MuAIGC（Codex、Qwen Code）和 Goldlionren（Codex）共同编写的 provider。画布使用的 [tldraw SDK](https://tldraw.dev) 不是 MIT：它以自身的许可证打包在 `dist/` 中，许可证副本见 `licenses/tldraw-LICENSE.md`。从 `localhost` 或普通 `http` 访问时，它以开发模式运行，无需许可证密钥，右下角会显示一个小的 "Get a license for production" 标记。
