import CSI 1.0
import QtQuick 2.0
import "TrackIdApiClient.js" as ApiClient

Item {
  property int       index:            1
  property bool      isOnAirState:     null
  property real      onAirLevelState:  null
  property bool      eqDirty:          false

  readonly property string    pathPrefix:  "app.traktor.mixer.channels." + index + "."

  AppProperty { id: propVolume;             path: pathPrefix + "volume";               onValueChanged: updateOnAirState() }
  AppProperty { id: propEqHigh;             path: pathPrefix + "eq.high";              onValueChanged: eqDirty = true }
  AppProperty { id: propEqMid;              path: pathPrefix + "eq.mid";               onValueChanged: eqDirty = true }
  AppProperty { id: propEqLow;              path: pathPrefix + "eq.low";               onValueChanged: eqDirty = true }
  AppProperty { id: propXfaderAssignLeft;   path: pathPrefix + "xfader_assign.left";   onValueChanged: updateOnAirState() }
  AppProperty { id: propXfaderAssignRight;  path: pathPrefix + "xfader_assign.right";  onValueChanged: updateOnAirState() }
  AppProperty { id: propXfaderAdjust;       path: "app.traktor.mixer.xfader.adjust";   onValueChanged: updateOnAirState() }

  Timer {
    // Keep-alive: re-send channel state so a server started after the last
    // on-air transition still converges (same pattern as ApiDeck).
    interval: 10000
    repeat: true
    running: true

    onTriggered: {
      ApiClient.send("updateChannel/" + index, {
        isOnAir: computeIsOnAir(),
        eq: {
          high: propEqHigh.value,
          mid: propEqMid.value,
          low: propEqLow.value,
        },
      })
    }
  }
  Timer {
    // EQ changes arrive continuously while a knob is turned. Poll instead
    // of debouncing so the overlay updates live during the turn instead of
    // waiting ~250ms after the knob stops moving.
    interval: 100
    repeat: true
    running: true

    onTriggered: {
      if (!eqDirty) return
      eqDirty = false
      ApiClient.send("updateChannel/" + index, {
        eq: {
          high: propEqHigh.value,
          mid: propEqMid.value,
          low: propEqLow.value,
        },
      })
    }
  }
  Timer {
    id: onAirLevelChangedTimer
    interval: 250

    onTriggered: {
      var onAirLevel = propVolume.value
      if ((propXfaderAssignLeft.value && propXfaderAdjust.value > 0.5)
        || (propXfaderAssignRight.value && propXfaderAdjust.value < 0.5)) {
        onAirLevel *= 1 - Math.abs(propXfaderAdjust.value * 2 - 1)
      }

      if (onAirLevel != onAirLevelState) {
        ApiClient.send("updateChannel/" + index, {
          onAirLevel: onAirLevel,
        })
        onAirLevelState = onAirLevel
      }
    }
  }

  function computeIsOnAir() {
    return propVolume.value > 0
      && ((!propXfaderAssignLeft.value && !propXfaderAssignRight.value)
        || (propXfaderAssignLeft.value && propXfaderAdjust.value < 1)
        || (propXfaderAssignRight.value && propXfaderAdjust.value > 0))
  }

  function updateOnAirState() {
    var isOnAir = computeIsOnAir()

    if (isOnAir != isOnAirState) {
      ApiClient.send("updateChannel/" + index, {
        isOnAir: isOnAir,
      })
      isOnAirState = isOnAir
    }

    onAirLevelChangedTimer.restart()
  }
}
