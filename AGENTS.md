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

- Keep POS product search and staged field editing in the invoice table's entry row, aligned to the invoice columns; this makes keyboard entry and the bill a single continuous workflow.
- Save bill-free sales returns through a dedicated permission-checked atomic database function; this keeps linked returns' invoice quantity limits intact while posting stock, refund, and accounting records together.
