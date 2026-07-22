import CSI 1.0
import QtQuick 2.0
import "TrackIdApiClient.js" as ApiClient

// Samples channel/master levels and crossfader at 10 Hz and sends one
// /updateMixer frame per tick. Skips the send when nothing changed so an
// idle mixer stays silent on the wire, except for a 10s keep-alive that
// forces a send so a server started after the last change still converges.
Item {
  property string lastFrame: ""

  AppProperty { id: propLevel1;      path: "app.traktor.mixer.channels.1.level.prefader.linear.sum" }
  AppProperty { id: propLevel2;      path: "app.traktor.mixer.channels.2.level.prefader.linear.sum" }
  AppProperty { id: propLevel3;      path: "app.traktor.mixer.channels.3.level.prefader.linear.sum" }
  AppProperty { id: propLevel4;      path: "app.traktor.mixer.channels.4.level.prefader.linear.sum" }
  AppProperty { id: propMasterLeft;  path: "app.traktor.mixer.master.level.left" }
  AppProperty { id: propMasterRight; path: "app.traktor.mixer.master.level.right" }
  AppProperty { id: propMasterSum;   path: "app.traktor.mixer.master.level.sum" }
  AppProperty { id: propMasterClip;  path: "app.traktor.mixer.master.level.clip.sum" }
  AppProperty { id: propXfader;      path: "app.traktor.mixer.xfader.adjust" }

  Timer {
    interval: 100
    repeat: true
    running: true

    onTriggered: sendMixerFrame(false)
  }

  Timer {
    // Keep-alive: re-send so a server started after the last change still
    // converges (same pattern as ApiDeck/ApiChannel/ApiMasterClock).
    interval: 10000
    repeat: true
    running: true

    onTriggered: sendMixerFrame(true)
  }

  function sendMixerFrame(force) {
    var frame = {
      channels: [
        { level: propLevel1.value },
        { level: propLevel2.value },
        { level: propLevel3.value },
        { level: propLevel4.value },
      ],
      xfader: propXfader.value,
      master: {
        left: propMasterLeft.value,
        right: propMasterRight.value,
        sum: propMasterSum.value,
        clip: propMasterClip.value ? true : false,
      },
    }
    var serialized = JSON.stringify(frame)
    if (!force && serialized === lastFrame) return
    lastFrame = serialized
    ApiClient.send("updateMixer", frame)
  }
}
