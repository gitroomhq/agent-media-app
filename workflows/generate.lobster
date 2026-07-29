name: agent-media-ugc
args:
  script:
    default: ""
  actor:
    default: ""
  style:
    default: "hormozi"
  template:
    default: ""
steps:
  - id: check_credits
    command: agent-media credits --json

  - id: list_actors
    command: agent-media actor list --json

  - id: confirm_generation
    command: |
      echo "UGC Video Generation"
      echo "Script: ${script}"
      echo "Actor: ${actor:-auto-selected}"
      echo "Style: ${style}"
      echo "Template: ${template:-free-form}"
      echo "Ready to generate?"
    approval: required

  - id: generate
    command: agent-media ugc "${script}" --actor ${actor} --style ${style} ${template:+--template ${template}} --sync --json
    condition: $confirm_generation.approved

  - id: download
    command: agent-media download $generate.json.job_id --json
    condition: $confirm_generation.approved
