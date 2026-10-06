---
name: skill-authoring
description: How to write a good reusable skill (SKILL.md) after completing a complex task. Use before calling skill_manage create.
version: 1.0.0
---

# Writing skills

A skill is a procedure you (or a smaller model) can follow next time without rediscovering it.

- **name**: lowercase-with-dashes, specific (`deploy-django-to-docker`, not `deploy`).
- **description**: one sentence: what it does + WHEN to use it. This decides whether it gets loaded.
- Body sections: *When to use*, *Steps* (numbered, concrete commands with placeholders), *Pitfalls* (what went wrong this time and the fix), *Verification* (how to prove it worked).
- Keep it under ~60 lines; put long reference material in supporting files (`skill_manage action=write_file`).
- No secrets, no user-specific paths unless the skill is personal.
- When a skill turns out wrong, `skill_manage action=patch` it immediately.
