// Completa CLIENT_ID después de registrar la app en Azure AD (ver instrucciones).
const CONFIG = {
  CLIENT_ID: "6df28c63-6c7e-4c74-a87f-af63e9fe3d0f",
  AUTHORITY: "https://login.microsoftonline.com/common",
  REDIRECT_URI: window.location.origin + window.location.pathname,
  GRAPH_SCOPES: ["Files.ReadWrite", "User.Read"],
  EXCEL_FILENAME: "BASE_DE_DATOS_v2.xlsx",
  RUTA_ARCHIVO: "Documents/BASE_DE_DATOS_v2.xlsx",
  TABLE_NAME: "TablaBaseDatos",
  HOJA_CONFIG: "Configuracion",
  HOJA_CLIENTES: "Clientes_Fincas",
  ASESOR: {
    nombre: "Miguel Leon",
    telefono: "3229636167",
    profesion: "Ingeniero Agronomo",
    cargo: "Asesor Tecnico Comercial - Galagro Norte de Antioquia",
  },
};
