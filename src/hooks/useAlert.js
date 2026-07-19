import { useState, useCallback } from 'react'

export default function useAlert() {
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  })

  const showAlert = useCallback((title, message, buttons = [{ text: 'OK' }]) => {
    setAlertConfig({ visible: true, title, message, buttons })
  }, [])

  const hideAlert = useCallback(() => {
    setAlertConfig(prev => ({ ...prev, visible: false }))
  }, [])

  return { alertConfig, showAlert, hideAlert }
}