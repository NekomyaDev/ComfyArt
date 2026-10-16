from __future__ import annotations

import folder_paths

FILES = {
    "diffusion_models": ["minimax-h3/minimax_h3_fl2va_pruned_int8_convrot.safetensors", "z_image_turbo_bf16.safetensors", "old/z_image_turbo_bf16.safetensors"],
    "loras": ["minimax-h3/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors"],
    "custom_nodes": ["SomePack/model.safetensors"],
    "configs": ["sub/model.yaml"],
}


async def test_subfolder_models_map_to_their_relative_path(bot_client, monkeypatch):
    monkeypatch.setattr(folder_paths, "supported_pt_extensions", {".safetensors", ".pt"}, raising=False)
    monkeypatch.setattr(folder_paths, "folder_names_and_paths", {
        "diffusion_models": ([], {".safetensors"}), "loras": ([], {".safetensors"}), "custom_nodes": ([], set()), "configs": ([], [".yaml"]),
    }, raising=False)
    monkeypatch.setattr(folder_paths, "get_filename_list", lambda folder: FILES[folder])
    paths = await (await bot_client.get("/comfyart/model-paths")).json()
    assert paths == {
        "minimax_h3_fl2va_pruned_int8_convrot.safetensors": "minimax-h3/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors": "minimax-h3/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
    }
