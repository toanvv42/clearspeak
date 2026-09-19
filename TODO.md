# TODO

## Fix sample speech playback on iPhone

- [x] Avoid calling `speechSynthesis.cancel()` immediately before `speechSynthesis.speak()` in `components/practice-editor.tsx`. WebKit can asynchronously cancel the newly queued utterance; Apple documents the fix for Safari 27.
- [x] When playback is already active, make the Listen button stop playback and return instead of cancelling and immediately restarting it.
- [x] Track `SpeechSynthesisUtterance` start, end, and error events so the UI can expose playback state and failures.
- [x] Add a regression test covering the Listen button and asserting that idle playback does not call `cancel()` before `speak()`.
- [ ] Verify on a physical iPhone with Silent Mode both off and on, and confirm that Siri/speech voices are enabled.

References:

- WebKit fix: <https://commits.webkit.org/309349@main>
- Safari 27 release note: <https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes>
