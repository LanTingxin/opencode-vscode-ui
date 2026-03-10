import React from "react"

export function useModifierState() {
  React.useEffect(() => {
    const syncModifierState = (active: boolean) => {
      document.body.classList.toggle("oc-modKey", active)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      syncModifierState(event.metaKey || event.ctrlKey)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      syncModifierState(event.metaKey || event.ctrlKey)
    }

    const onBlur = () => {
      syncModifierState(false)
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
      syncModifierState(false)
    }
  }, [])
}
