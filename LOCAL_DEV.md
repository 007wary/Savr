# Local Android builds (WSL2)

Native Android builds (`expo run:android` / `npm run android`) do not work on
native Windows for this project — NDK 27 hits a Windows-only `ld.lld` linker
bug (undefined libc++/RTTI symbols in `react_codegen_safeareacontext` /
`react_codegen_rnscreens`), and downgrading to NDK 26 breaks compilation
elsewhere (`std::format` used by RN 0.81's `graphicsConversions.h` isn't in
NDK 26's libc++). Both are open upstream issues with no fix as of writing.
GitHub Actions (Linux runner) is unaffected and remains the production build.

For local testing, build inside **WSL2** instead.

## One-time setup

1. Install WSL2 (Administrator PowerShell): `wsl --install`, then reboot.
2. In the Ubuntu shell: install Java 17, Node 20 (via nvm), and a Linux
   Android SDK (`cmdline-tools` + `sdkmanager` — install `platform-tools`,
   `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`,
   `cmake;3.22.1`). Don't reuse the Windows SDK's `build-tools`/`aapt` — it's
   Windows-only and fails at the packaging step.
3. Clone the repo into WSL2's native filesystem (`~/savr`), not `/mnt/c/...`
   — building across the 9P mount is slow and was the trigger for a VM
   freeze under Gradle's parallel native compilation.
4. Copy `.env` and `google-services.json` from the Windows checkout into the
   WSL2 clone (they're gitignored).
5. `adb` binary: WSL2 can't see the Windows-hosted emulator directly over
   its default network path (firewall + emulator adb ports bound to
   `127.0.0.1` only). Fix: make `$ANDROID_HOME/platform-tools/adb` a wrapper
   script that execs the Windows `adb.exe`:
   ```bash
   cat > ~/android-sdk/platform-tools/adb << 'EOF'
   #!/bin/bash
   exec "/mnt/c/Users/<you>/AppData/Local/Android/Sdk/platform-tools/adb.exe" "$@"
   EOF
   chmod +x ~/android-sdk/platform-tools/adb
   ```
6. Metro networking: the emulator resolves the host as `10.0.2.2`, which
   points at **Windows**, not WSL2 where Metro actually runs. `adb reverse`
   alone doesn't cover this. Fix: one-time Windows port-forward
   (Administrator PowerShell):
   ```powershell
   $wslIp = (wsl -d Ubuntu -- hostname -I).Trim().Split(" ")[0]
   netsh interface portproxy add v4tov4 listenport=8081 listenaddress=0.0.0.0 connectport=8081 connectaddress=$wslIp
   ```
   The WSL2 IP can change across reboots — re-run this if Metro connection
   errors come back after a restart (check with
   `netsh interface portproxy show v4tov4`).
7. `.wslconfig` (`C:\Users\<you>\.wslconfig`) caps WSL2's resource usage so a
   parallel native build can't wedge the VM:
   ```
   [wsl2]
   memory=8GB
   processors=6
   swap=4GB
   ```

## Day-to-day

```bash
cd ~/savr
git pull
npm install --legacy-peer-deps   # if package.json changed
npm run android                   # builds, installs, starts Metro
```

If `app.json`'s Expo plugin config changes (e.g. AdMob app ID, permissions),
the committed `android/` folder won't pick it up automatically — run
`npx expo prebuild --platform android --clean` to regenerate it, then
re-copy `google-services.json` into `android/app/`.

To limit build resource usage manually:
```bash
cd ~/savr/android
./gradlew app:assembleDebug -PreactNativeArchitectures=x86_64 --max-workers=2
```
