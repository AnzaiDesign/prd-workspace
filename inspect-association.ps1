$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport,Guid("F04061AC-1659-4A3F-A954-775AA57FC083"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface PrdAssocHandler {
 [PreserveSig] int GetName([MarshalAs(UnmanagedType.LPWStr)] out string name);
 [PreserveSig] int GetUIName([MarshalAs(UnmanagedType.LPWStr)] out string name);
 [PreserveSig] int GetIconLocation([MarshalAs(UnmanagedType.LPWStr)] out string path,out int index);
 [PreserveSig] int IsRecommended();
}
[ComImport,Guid("973810AE-9599-4B88-9E4D-6EE98C9552DA"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface PrdAssocEnum {
 [PreserveSig] int Next(uint count,[MarshalAs(UnmanagedType.Interface)] out PrdAssocHandler handler,out uint fetched);
}
public static class PrdAssocInspection {
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern int SHAssocEnumHandlers(string ext,uint filter,out PrdAssocEnum handlers);
 public static string Read(){PrdAssocEnum list; int hr=SHAssocEnumHandlers(".prdproj",0,out list);if(hr<0)Marshal.ThrowExceptionForHR(hr); string output="";PrdAssocHandler h;uint n;while(list.Next(1,out h,out n)==0&&n==1){string path,label;h.GetName(out path);h.GetUIName(out label);output+=path+" | "+label+" | recommended="+(h.IsRecommended()==0)+Environment.NewLine;Marshal.ReleaseComObject(h);}Marshal.ReleaseComObject(list);return output;}
}
'@
[PrdAssocInspection]::Read()
