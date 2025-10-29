# Handling Git Merge Conflicts

When Git cannot automatically merge two changes, it marks the affected files with conflict markers. Each marker shows the competing edits:

```
<<<<<<< HEAD
Your current branch's version ("current change")
=======
The other branch's version being merged ("incoming change")
>>>>>>> feature/some-branch
```

## Choosing between the options

- **Accept Current Change** keeps everything between `<<<<<<< HEAD` and `=======`. Choose this when your branch's version is correct and should override the incoming edits.
- **Accept Incoming Change** keeps everything between `=======` and `>>>>>>> …`. Use this when the changes from the other branch should replace your local version.
- **Accept Both Changes** keeps both sections (usually by concatenating them). Pick this when both edits are valid and should appear together. You may still need to adjust formatting afterwards.

If neither section is quite right, you can also manually edit the file to craft the correct final version.

## After resolving

1. Remove the conflict markers and ensure the file looks exactly how you want.
2. Stage the file with `git add <file>`.
3. Complete the merge or rebase with `git merge --continue`, `git rebase --continue`, or by committing normally.
4. Run tests to confirm everything still works.

Keeping these steps in mind helps you decide which option to pick and why each choice matters.
