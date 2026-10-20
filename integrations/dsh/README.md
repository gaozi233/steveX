# DSH integration

SteveX uses DeepSeek Harness as an optional Agent runtime. The upstream runtime
is installed from npm instead of being copied into this repository.

## Version and source

- npm package: `@deepseek-ai/dsh@0.2.1-rc.2` (exact version in `package-lock.json`)
- upstream repository: <https://github.com/deepseek-ai/deepseek-harness>
- upstream tag: `dsh-v0.2.1-rc.2`
- upstream commit: `687f282e8625c6b8d11ff58211a90524be2e4317`

Run `npm install` after cloning, then use `npm run dsh -- web` or
`start-dsh.bat`. DSH keeps its user profiles and runtime data outside the
SteveX source tree.

## Customization boundary

Do not edit DSH under `node_modules`. SteveX-owned behavior belongs in
`dsh-plugins/`; currently `dsh-plugins/router` contains the staged routing
framework. Install it into the desired DSH profile as described in that
package's README.

If a future DSH core change is unavoidable:

1. record the upstream tag and commit;
2. keep the change as a small patch in `integrations/dsh/patches/`;
3. add a reproducible application step and a regression test;
4. prefer submitting the fix upstream before carrying it locally.

## Archived source-build patch

`patches/0001-windows-git-status-max-buffer.patch` records the only SteveX core
change found in the previously vendored DSH tree. It raised `spawnSync`'s
buffer while a whole vendored source tree was being replaced. The npm runtime
does not execute that source-build helper, so the patch is retained for
history and source-build troubleshooting but is not applied during install.

The original full source remains recoverable from Git history before the
dependency migration; it is not needed in current checkouts.
