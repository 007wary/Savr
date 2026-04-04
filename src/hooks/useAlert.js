import { useState } from 'react'

export default function useAlert() {
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  })

  function showAlert(title, message, buttons = [{ text: 'OK' }]) {
    setAlertConfig({ visible: true, title, message, buttons })
  }

  function hideAlert() {
    setAlertConfig(prev => ({ ...prev, visible: false }))
  }

  return { alertConfig, showAlert, hideAlert }
}