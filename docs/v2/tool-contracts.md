<!-- AUTO-GENERATED, do not hand-edit. -->
# V1 tool contracts

Tooling-First V1 mandatory tool contracts, generated from `@agentmedia/schema`.

## actor_refs

Resolve existing actor reference or create a new reusable character.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "mode": {
      "type": "string",
      "enum": [
        "use_existing",
        "create_new"
      ]
    },
    "character_id": {
      "type": "string",
      "pattern": "^char_[A-Za-z0-9]{10,}$"
    },
    "display_name": {
      "type": "string",
      "minLength": 2,
      "maxLength": 60
    },
    "description": {
      "type": "string",
      "minLength": 8,
      "maxLength": 400
    },
    "photo_url": {
      "type": "string",
      "format": "uri"
    }
  },
  "required": [
    "mode"
  ],
  "additionalProperties": false
}
```

### Output schema

```json
{
  "anyOf": [
    {
      "type": "object",
      "properties": {
        "source": {
          "type": "string",
          "const": "existing"
        },
        "character_id": {
          "type": "string",
          "pattern": "^char_[A-Za-z0-9]{10,}$"
        },
        "job_id": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "source",
        "character_id"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "source": {
          "type": "string",
          "const": "created"
        },
        "character_id": {
          "anyOf": [
            {
              "type": "string",
              "pattern": "^char_[A-Za-z0-9]{10,}$"
            },
            {
              "type": "null"
            }
          ]
        },
        "job_id": {
          "type": "string",
          "format": "uuid"
        }
      },
      "required": [
        "source",
        "character_id"
      ],
      "additionalProperties": false
    }
  ]
}
```

## scene_continuity

Resolve last-frame references and continuity guidance.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "previous_job_id": {
      "type": "string",
      "format": "uuid"
    },
    "explicit_last_frame_url": {
      "type": "string",
      "format": "uri"
    },
    "scene_notes": {
      "type": "string",
      "minLength": 1,
      "maxLength": 600
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "type": "object",
  "properties": {
    "last_frame_reference_url": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ]
    },
    "continuity_prompt_suffix": {
      "type": "string",
      "minLength": 1
    },
    "source": {
      "type": "string",
      "enum": [
        "job_wireframe",
        "explicit",
        "none"
      ]
    }
  },
  "required": [
    "last_frame_reference_url",
    "continuity_prompt_suffix",
    "source"
  ],
  "additionalProperties": false
}
```

## elevenlabs_audio

Prepare ElevenLabs synthesis path for voice continuity.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "voice_id": {
      "type": "string",
      "minLength": 1
    },
    "script": {
      "type": "string",
      "minLength": 1,
      "maxLength": 600
    },
    "model_id": {
      "type": "string",
      "default": "eleven_multilingual_v2"
    }
  },
  "required": [
    "voice_id",
    "script"
  ],
  "additionalProperties": false
}
```

### Output schema

```json
{
  "type": "object",
  "properties": {
    "integration_enabled": {
      "type": "boolean"
    },
    "request_payload": {
      "anyOf": [
        {
          "type": "object",
          "additionalProperties": {}
        },
        {
          "type": "null"
        }
      ]
    },
    "preview_url": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "integration_enabled",
    "request_payload",
    "preview_url"
  ],
  "additionalProperties": false
}
```

## portrait_gpt2

Create one realistic portrait with gpt-image-2.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "description": {
      "type": "string",
      "minLength": 8,
      "maxLength": 400
    },
    "reference_photo_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/"
    },
    "setting": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "aspect_ratio": {
      "type": "string",
      "enum": [
        "1:1",
        "9:16"
      ],
      "default": "1:1"
    },
    "realism_target": {
      "type": "string",
      "enum": [
        "natural",
        "commercial",
        "raw_iphone"
      ],
      "default": "natural"
    }
  },
  "required": [
    "description"
  ],
  "additionalProperties": false
}
```

### Output schema

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "type": "string",
      "const": "submitted"
    },
    "portrait_url": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ]
    },
    "provider": {
      "type": "string",
      "const": "gpt-image-2"
    },
    "credits_deducted": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "job_id",
    "status",
    "portrait_url",
    "provider",
    "credits_deducted"
  ],
  "additionalProperties": false
}
```

## character_sheet_gpt2

Create a multi-angle character sheet from a portrait using gpt-image-2.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "portrait_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/"
    },
    "description": {
      "type": "string",
      "maxLength": 80
    },
    "aspect_ratio": {
      "type": "string",
      "enum": [
        "1:1",
        "9:16"
      ],
      "default": "1:1"
    }
  },
  "required": [
    "portrait_url"
  ],
  "additionalProperties": false
}
```

### Output schema

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "type": "string",
      "const": "submitted"
    },
    "character_sheet_url": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ]
    },
    "provider": {
      "type": "string",
      "const": "gpt-image-2"
    },
    "credits_deducted": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "job_id",
    "status",
    "character_sheet_url",
    "provider",
    "credits_deducted"
  ],
  "additionalProperties": false
}
```

## wireframe_gpt2

Create a photographic storyboard / wireframe board from a character sheet + script, with numbered panels showing the action progression.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "character_sheet_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/"
    },
    "script": {
      "type": "string",
      "minLength": 8,
      "maxLength": 600
    },
    "n_panels": {
      "type": "number",
      "enum": [
        4,
        6,
        8,
        10
      ],
      "default": 6
    },
    "aspect_ratio": {
      "type": "string",
      "enum": [
        "9:16",
        "1:1",
        "16:9"
      ],
      "default": "9:16"
    }
  },
  "required": [
    "character_sheet_url",
    "script"
  ],
  "additionalProperties": false
}
```

### Output schema

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "type": "string",
      "const": "submitted"
    },
    "wireframe_url": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ]
    },
    "provider": {
      "type": "string",
      "const": "gpt-image-2"
    },
    "credits_deducted": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "job_id",
    "status",
    "wireframe_url",
    "provider",
    "credits_deducted"
  ],
  "additionalProperties": false
}
```

## simple_selfie

Generate a 5/10/15s vertical UGC selfie video from a character sheet, with native lip-synced audio. Waist-up, no object held.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "character_sheet_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/"
    },
    "duration": {
      "type": "number",
      "enum": [
        5,
        10,
        15
      ],
      "default": 10
    },
    "script": {
      "type": "string",
      "minLength": 1,
      "maxLength": 600,
      "description": "Spoken line (lip-synced). Keep it SHORT for natural, unhurried pacing, about 1.5 words/sec: ~8 words for 5s, ~15 for 10s, ~22 for 15s (never more than ~2.2/sec or it sounds rushed). Trim the user's line if it is longer."
    },
    "scene_action": {
      "type": "string",
      "minLength": 3,
      "maxLength": 400
    },
    "background_music": {
      "anyOf": [
        {
          "type": "boolean"
        },
        {
          "type": "string",
          "maxLength": 120
        }
      ]
    },
    "location": {
      "type": "string",
      "maxLength": 120
    },
    "pose": {
      "type": "string",
      "maxLength": 120
    },
    "aspect_ratio": {
      "type": "string",
      "enum": [
        "9:16",
        "1:1"
      ],
      "default": "9:16"
    }
  },
  "required": [
    "character_sheet_url"
  ],
  "additionalProperties": false
}
```

### Output schema

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "type": "string",
      "const": "submitted"
    },
    "video_url": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ]
    },
    "provider": {
      "type": "string",
      "const": "seedance-2-0"
    },
    "credits_deducted": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "job_id",
    "status",
    "video_url",
    "provider",
    "credits_deducted"
  ],
  "additionalProperties": false
}
```

## product_in_hands

Generate a 5/10/15s vertical UGC video where the character holds and shows a product (from a second reference image) in their hands, with native lip-synced audio (script) or a silent demo (scene_action).

### Input schema

```json
{
  "type": "object",
  "properties": {
    "character_sheet_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/"
    },
    "product_image_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/"
    },
    "duration": {
      "type": "number",
      "enum": [
        5,
        10,
        15
      ],
      "default": 10
    },
    "script": {
      "type": "string",
      "minLength": 1,
      "maxLength": 600,
      "description": "Spoken line (lip-synced). Keep it SHORT for natural, unhurried pacing, about 1.5 words/sec: ~8 words for 5s, ~15 for 10s, ~22 for 15s (never more than ~2.2/sec or it sounds rushed). Trim the user's line if it is longer."
    },
    "scene_action": {
      "type": "string",
      "minLength": 3,
      "maxLength": 400
    },
    "subject": {
      "type": "string",
      "maxLength": 80
    },
    "framing": {
      "type": "string",
      "enum": [
        "close_up",
        "full_body"
      ],
      "default": "close_up"
    },
    "background_music": {
      "anyOf": [
        {
          "type": "boolean"
        },
        {
          "type": "string",
          "maxLength": 120
        }
      ]
    },
    "location": {
      "type": "string",
      "maxLength": 120
    },
    "pose": {
      "type": "string",
      "maxLength": 120
    },
    "aspect_ratio": {
      "type": "string",
      "enum": [
        "9:16",
        "1:1"
      ],
      "default": "9:16"
    }
  },
  "required": [
    "character_sheet_url",
    "product_image_url"
  ],
  "additionalProperties": false
}
```

### Output schema

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "type": "string",
      "const": "submitted"
    },
    "video_url": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ]
    },
    "provider": {
      "type": "string",
      "const": "seedance-2-0"
    },
    "credits_deducted": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "job_id",
    "status",
    "video_url",
    "provider",
    "credits_deducted"
  ],
  "additionalProperties": false
}
```

## broll_talking_head

Generate an up-to-30s vertical talking-head video (seamless via last-frame-chained <=10s clips) with a user-supplied square b-roll video looping as a bottom-half overlay. Speech from script (Seedance voice) or a provided audio_url.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "actor_image_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/"
    },
    "portrait_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/",
      "description": "Optional clean close-up portrait of the same person as actor_image_url, a second identity reference for higher-fidelity faces. Auto-resolved from the saved character when omitted."
    },
    "broll_video_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/",
      "description": "Optional. A square-ish b-roll video overlaid on the lower half while the actor narrates. Omit for a plain multi-take talking head (no overlay), the long-form monologue path."
    },
    "script": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1200,
      "description": "What the actor says (lip-synced). Up to ~30s of speech, keep it ~1.5 words/sec for natural pacing (~45 words for 30s)."
    },
    "audio_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/"
    },
    "duration": {
      "type": "number",
      "enum": [
        10,
        15,
        20,
        25,
        30
      ],
      "default": 20
    },
    "aspect_ratio": {
      "type": "string",
      "enum": [
        "9:16",
        "1:1",
        "16:9"
      ],
      "default": "9:16"
    },
    "subtitles": {
      "type": "boolean",
      "default": false
    },
    "broll_width_rate": {
      "type": "number",
      "minimum": 0.1,
      "maximum": 1
    },
    "broll_start_time": {
      "type": "number",
      "minimum": 0,
      "maximum": 25
    },
    "broll_fade_out": {
      "type": "boolean"
    }
  },
  "required": [
    "actor_image_url"
  ],
  "additionalProperties": false
}
```

### Output schema

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "type": "string",
      "const": "submitted"
    },
    "video_url": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ]
    },
    "provider": {
      "type": "string",
      "const": "seedance-2-0"
    },
    "duration_seconds": {
      "type": "integer",
      "exclusiveMinimum": 0
    },
    "credits_deducted": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "job_id",
    "status",
    "video_url",
    "provider",
    "duration_seconds",
    "credits_deducted"
  ],
  "additionalProperties": false
}
```

## subtitles_v2

Burn TikTok/Hormozi-style captions onto a vNext video. Auto-transcribes via Whisper when transcript is omitted.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "video_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/"
    },
    "transcript": {
      "type": "string",
      "minLength": 1,
      "maxLength": 5000
    },
    "style": {
      "type": "string",
      "enum": [
        "hormozi",
        "tiktok",
        "minimal"
      ],
      "default": "hormozi"
    },
    "language": {
      "type": "string",
      "minLength": 2,
      "maxLength": 2
    },
    "aspect_ratio": {
      "type": "string",
      "enum": [
        "9:16",
        "1:1",
        "16:9"
      ],
      "default": "9:16"
    }
  },
  "required": [
    "video_url"
  ],
  "additionalProperties": false
}
```

### Output schema

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "type": "string",
      "const": "submitted"
    },
    "video_url": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ]
    },
    "provider": {
      "type": "string",
      "const": "whisper-ffmpeg"
    },
    "credits_deducted": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "job_id",
    "status",
    "video_url",
    "provider",
    "credits_deducted"
  ],
  "additionalProperties": false
}
```

## lip_sync

Lip-sync a face (image or existing clip) to a provided audio track (your own recording). No TTS/voice-clone needed, bring your own audio.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "image_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/"
    },
    "audio_url": {
      "type": "string",
      "format": "uri",
      "pattern": "^https:\\/\\/"
    },
    "duration": {
      "type": "number",
      "enum": [
        5,
        10,
        15
      ],
      "default": 10
    },
    "aspect_ratio": {
      "type": "string",
      "enum": [
        "9:16",
        "1:1"
      ],
      "default": "9:16"
    }
  },
  "required": [
    "image_url",
    "audio_url"
  ],
  "additionalProperties": false
}
```

### Output schema

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "type": "string",
      "const": "submitted"
    },
    "video_url": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ]
    },
    "provider": {
      "type": "string",
      "const": "seedance-2-0"
    },
    "credits_deducted": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "job_id",
    "status",
    "video_url",
    "provider",
    "credits_deducted"
  ],
  "additionalProperties": false
}
```

## selfie

Submit a selfie generation job.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "character_id": {
      "type": "string",
      "pattern": "^char_[A-Za-z0-9]{10,}$"
    },
    "photo_url": {
      "type": "string",
      "format": "uri"
    },
    "description": {
      "type": "string",
      "minLength": 8,
      "maxLength": 400
    },
    "script": {
      "type": "string",
      "maxLength": 600
    },
    "scene_action": {
      "type": "string",
      "minLength": 4,
      "maxLength": 400
    },
    "duration": {
      "type": "number",
      "enum": [
        5,
        10,
        15
      ],
      "default": 10
    },
    "subtitles": {
      "type": "boolean",
      "default": true
    }
  },
  "additionalProperties": false
}
```

### Output schema

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "type": "string",
      "const": "submitted"
    },
    "credits_deducted": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "job_id",
    "status",
    "credits_deducted"
  ],
  "additionalProperties": false
}
```

## subtitles

Submit a subtitle burn job.

### Input schema

```json
{
  "type": "object",
  "properties": {
    "video_url": {
      "type": "string",
      "format": "uri"
    },
    "style": {
      "type": "string",
      "default": "hormozi"
    },
    "transcript": {
      "type": "string",
      "minLength": 1,
      "maxLength": 5000
    },
    "language": {
      "type": "string",
      "minLength": 2,
      "maxLength": 2
    }
  },
  "required": [
    "video_url"
  ],
  "additionalProperties": false
}
```

### Output schema

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "format": "uuid"
    },
    "status": {
      "type": "string",
      "const": "submitted"
    },
    "credits_deducted": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": [
    "job_id",
    "status",
    "credits_deducted"
  ],
  "additionalProperties": false
}
```
