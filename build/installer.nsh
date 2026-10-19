; Pages et réglages propres à dev-brows dans l'installateur Windows.
; - Langue choisie (français ou anglais) : écrite dans resources\default-lang.
; - Page « Confidentialité » : ce à quoi l'appli se connecte, et une case pour
;   désactiver les vérifications automatiques, écrite dans resources\default-autoupdate.
; dev-brows lit ces fichiers au premier lancement ; « lang » et « update auto » les changent ensuite.

!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER
  !include MUI2.nsh
  !include nsDialogs.nsh

  Var DbAutoUpdate
  Var DbAutoUpdateBox

  !macro customPageAfterChangeDir
    Page custom DbPrivacyShow DbPrivacyLeave
  !macroend

  Function DbPrivacyShow
    ${If} $LANGUAGE == 1036
      !insertmacro MUI_HEADER_TEXT "Confidentialité" "Ce à quoi dev-brows se connecte"
    ${Else}
      !insertmacro MUI_HEADER_TEXT "Privacy" "What dev-brows connects to"
    ${EndIf}
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${If} $LANGUAGE == 1036
      ${NSD_CreateLabel} 0 0 100% 64u "dev-brows ne collecte aucune donnée et n'a pas de télémétrie. Il se connecte tout seul à GitHub (nouvelle version de dev-brows et de uBlock Origin) et au service de mise à jour du Chrome Web Store (extensions), à chaque lancement."
      Pop $0
      ${NSD_CreateCheckbox} 0 72u 100% 14u "Vérifier les mises à jour automatiquement (dev-brows et extensions)"
    ${Else}
      ${NSD_CreateLabel} 0 0 100% 64u "dev-brows collects no data and has no telemetry. At every launch it connects by itself to GitHub (new versions of dev-brows and uBlock Origin) and to the Chrome Web Store update service (extensions)."
      Pop $0
      ${NSD_CreateCheckbox} 0 72u 100% 14u "Check for updates automatically (dev-brows and extensions)"
    ${EndIf}
    Pop $DbAutoUpdateBox
    ${If} $DbAutoUpdate != "off"
      ${NSD_Check} $DbAutoUpdateBox
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function DbPrivacyLeave
    ${NSD_GetState} $DbAutoUpdateBox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $DbAutoUpdate "on"
    ${Else}
      StrCpy $DbAutoUpdate "off"
    ${EndIf}
  FunctionEnd
!endif

!macro customInstall
  FileOpen $0 "$INSTDIR\resources\default-lang" w
  ${If} $LANGUAGE == 1036
    FileWrite $0 "fr"
  ${Else}
    FileWrite $0 "en"
  ${EndIf}
  FileClose $0
  ; Mise à jour silencieuse (/S, electron-updater) : pas de page, on n'écrit rien.
  !ifndef BUILD_UNINSTALLER
  ${IfNot} ${Silent}
    FileOpen $0 "$INSTDIR\resources\default-autoupdate" w
    ${If} $DbAutoUpdate == "off"
      FileWrite $0 "off"
    ${Else}
      FileWrite $0 "on"
    ${EndIf}
    FileClose $0
  ${EndIf}
  !endif
!macroend
