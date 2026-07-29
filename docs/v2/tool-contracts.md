<!-- AUTO-GENERATED — do not hand-edit. -->
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
