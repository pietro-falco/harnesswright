#!/bin/sh
set -e

usage() {
  echo "Usage: worktree.sh new <branch>" >&2
  echo "       worktree.sh list" >&2
}

cmd_new() {
  branch="$1"
  if [ -z "$branch" ]; then
    usage
    exit 2
  fi

  if git worktree list --porcelain | grep -q "^branch refs/heads/${branch}$"; then
    echo "a worktree for branch '${branch}' already exists" >&2
    exit 1
  fi

  repo_name=$(basename "$(git rev-parse --show-toplevel)")
  target="../${repo_name}-${branch}"
  git worktree add "$target" -b "$branch"
}

cmd_list() {
  git worktree list
}

case "$1" in
  new)
    cmd_new "$2"
    ;;
  list)
    cmd_list
    ;;
  *)
    usage
    exit 2
    ;;
esac
