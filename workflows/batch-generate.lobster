name: agent-media-batch-ugc
args:
  scripts:
    default: "[]"
  actor:
    default: ""
  style:
    default: "hormozi"
steps:
  - id: check_credits
    command: agent-media credits --json

  - id: preview_batch
    command: |
      echo "Batch UGC Generation"
      echo "Actor: ${actor}"
      echo "Style: ${style}"
      echo "Scripts: ${scripts}"
    approval: required

  - id: submit_batch
    command: |
      for script in $(echo '${scripts}' | jq -r '.[]'); do
        agent-media ugc "$script" --actor ${actor} --style ${style} --json
      done
    condition: $preview_batch.approved

  - id: list_results
    command: agent-media list --status completed --limit 10 --json
    condition: $preview_batch.approved
