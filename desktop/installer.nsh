; Keep the normal electron-builder update rollback, but never report success
; and remove the uninstall registration while the application payload remains.
!macro customInstall
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "InstallLocation" "$INSTDIR"
!macroend

!macro customRemoveFiles
  ${If} $INSTDIR == ""
    Abort "安装目录为空，已停止卸载。"
  ${EndIf}
  ${GetRoot} "$INSTDIR" $R1
  ${If} $INSTDIR == $R1
    Abort "安装目录不能是磁盘根目录，已停止卸载。"
  ${EndIf}
  ${If} $INSTDIR == "$R1\"
    Abort "安装目录不能是磁盘根目录，已停止卸载。"
  ${EndIf}
  ${If} ${isUpdated}
    CreateDirectory "$PLUGINSDIR\old-install"
    Push ""
    Call un.atomicRMDir
    Pop $R0
    ${If} $R0 != 0
      DetailPrint "更新失败，文件被占用：$R0"
      Push ""
      Call un.restoreFiles
      Pop $R1
      Abort "文件被占用，请关闭软件及相关窗口后重试。旧版本已保留。"
    ${EndIf}
  ${EndIf}
  SetOutPath $TEMP
  ClearErrors
  RMDir /r "$INSTDIR"
  ${If} ${Errors}
    SetErrorLevel 1
    IfSilent +2
    MessageBox MB_OK|MB_ICONSTOP "部分程序文件未能删除。请关闭软件及占用安装目录的程序后重新卸载。安装记录已保留。$\r$\n目录：$INSTDIR"
    Abort "卸载未完成：程序文件仍被占用或没有删除权限。"
  ${EndIf}
!macroend

; The in-app manual association uses a compatibility ProgID in addition to
; electron-builder's registered file type. Remove it only if this install owns it.
!macro customUnInstallSection
Section "un.ManualAssociationCleanup"
  SectionIn RO
  ${IfNot} ${isUpdated}
    ReadRegStr $R0 HKCU "Software\Classes\PRDWorkspace.Document\shell\open\command" ""
    ${If} $R0 == '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'
      ReadRegStr $R1 HKCU "Software\Classes\.prdproj" ""
      ${If} $R1 == "PRDWorkspace.Document"
        DeleteRegValue HKCU "Software\Classes\.prdproj" ""
      ${EndIf}
      ReadRegStr $R1 HKCU "Software\Classes\.prdproj\DefaultIcon" ""
      ${If} $R1 == '$\"$INSTDIR\resources\document.ico$\",0'
        DeleteRegKey HKCU "Software\Classes\.prdproj\DefaultIcon"
      ${EndIf}
      DeleteRegKey /ifempty HKCU "Software\Classes\.prdproj"
      DeleteRegKey HKCU "Software\Classes\PRDWorkspace.Document"
    ${EndIf}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
SectionEnd
!macroend
