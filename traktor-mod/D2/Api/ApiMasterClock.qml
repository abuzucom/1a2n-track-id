import CSI 1.0
import QtQuick 2.0
import "TrackIdApiClient.js" as ApiClient

Item {
  AppProperty { id: propMasterDeckId;  path: "app.traktor.masterclock.source_id";  onValueChanged: updateMasterClock() }
  AppProperty { id: propMasterBpm;     path: "app.traktor.masterclock.tempo";      onValueChanged: masterBpmChangedTimer.restart() }

  Timer {
    id: masterBpmChangedTimer
    interval: 250

    onTriggered: updateMasterClock()
  }
  Timer {
    // Keep-alive: re-send so a freshly started server learns the master deck.
    interval: 10000
    repeat: true
    running: true

    onTriggered: updateMasterClock()
  }

  function updateMasterClock() {
    ApiClient.send("updateMasterClock", {
      deck: (propMasterDeckId.value == -1) ? null : String.fromCharCode(65 + propMasterDeckId.value),
      bpm: propMasterBpm.value,
    })
  }
}
