<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

TESTING RULES

For every feature:

1. Identify what can go wrong.
2. Identify the happy path.
3. Identify validation failures.
4. Identify authorization failures.
5. Identify error states.
6. Identify important edge cases.
7. Add appropriate tests.
8. Run existing relevant tests.
9. Do not delete or weaken existing tests just to make the implementation pass.
10. Do not consider a feature complete until its acceptance criteria are verified.

After implementation, report:

- Tests added
- Tests executed
- Tests passed
- Tests failed
- Known untested areas
- Remaining risks
