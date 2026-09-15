import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Registro from "./pages/Registro";
import PanelPrincipal from "./pages/PanelPrincipal";
import RenovarSuscripcion from "./pages/RenovarSuscripcion";
import SelectorModulo from "./pages/SelectorModulo";
import SelectorEmpresaModulo from "./pages/SelectorEmpresaModulo";
import SelectorEjercicio from "./pages/SelectorEjercicio";

import {
  cerrarSesion,
  guardarSesionAutenticada,
  limpiarContextoSesion,
  obtenerSesionActualizada,
  obtenerUsuarioActual,
} from "./services/authService";


function leerSessionStorageJSON(clave) {
  try {
    const guardado = sessionStorage.getItem(clave);
    return guardado ? JSON.parse(guardado) : null;
  } catch {
    sessionStorage.removeItem(clave);
    return null;
  }
}

function consumirSesionDesdeUrl() {
  const hash = window.location.hash || "";
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const payload = params.get("trialSession");

  if (!payload) return null;

  try {
    const texto = decodeURIComponent(escape(window.atob(payload)));
    const data = JSON.parse(texto);

    if (data.token && data.usuario) {
      guardarSesionAutenticada(data.token, data.usuario);
      window.history.replaceState({}, document.title, window.location.pathname);
      return data.usuario;
    }
  } catch {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  return null;
}

function esModuloAdministracion(modulo) {
  return modulo === "administracion";
}

const ROLES_ADMIN_SISTEMA = ["admin", "superadmin", "super_admin", "administrador_sistema"];

function esAdminSistema(usuario) {
  return ROLES_ADMIN_SISTEMA.includes(String(usuario?.rol || "").trim().toLowerCase());
}

function requiereActivacionSuscripcion(usuario) {
  if (!usuario || esAdminSistema(usuario)) return false;
  return usuario?.suscripcion?.operativo === false;
}

function App() {
  const [usuario, setUsuario] = useState(() => consumirSesionDesdeUrl() || obtenerUsuarioActual());

  const [moduloActivo, setModuloActivo] = useState(
    sessionStorage.getItem("moduloActivo") || ""
  );

  const [empresaActiva, setEmpresaActiva] = useState(() =>
    leerSessionStorageJSON("empresaActiva")
  );

  const [ejercicioActivo, setEjercicioActivo] = useState(() =>
    leerSessionStorageJSON("ejercicioActivo")
  );

  const [vista, setVista] = useState(() => {
    const usuarioGuardado = obtenerUsuarioActual();
    const moduloGuardado = sessionStorage.getItem("moduloActivo");
    const empresaGuardada = leerSessionStorageJSON("empresaActiva");
    const ejercicioGuardado = leerSessionStorageJSON("ejercicioActivo");

    if (!usuarioGuardado) return "login";
    if (!moduloGuardado) return "selectorModulo";
    if (esModuloAdministracion(moduloGuardado)) return "panel";
    if (!empresaGuardada) return "selectorEmpresa";
    if (!ejercicioGuardado) return "selectorEjercicio";

    return "panel";
  });

  function loginCorrecto(usuarioLogueado) {
    setUsuario(usuarioLogueado);

    setModuloActivo("");
    setEmpresaActiva(null);
    setEjercicioActivo(null);

    limpiarContextoSesion();

    setVista("selectorModulo");
  }

  function seleccionarModulo(modulo) {
    sessionStorage.setItem("moduloActivo", modulo);
    sessionStorage.removeItem("empresaActiva");
    sessionStorage.removeItem("ejercicioActivo");

    setModuloActivo(modulo);
    setEmpresaActiva(null);
    setEjercicioActivo(null);

    setVista(esModuloAdministracion(modulo) ? "panel" : "selectorEmpresa");
  }

  function seleccionarEmpresa(empresa) {
    sessionStorage.setItem("empresaActiva", JSON.stringify(empresa));
    sessionStorage.removeItem("ejercicioActivo");

    setEmpresaActiva(empresa);
    setEjercicioActivo(null);

    setVista("selectorEjercicio");
  }

  function ejercicioSeleccionado(ejercicio) {
    sessionStorage.setItem("ejercicioActivo", JSON.stringify(ejercicio));

    setEjercicioActivo(ejercicio);
    setVista("panel");
  }

  function volverASeleccionModulo() {
    limpiarContextoSesion();

    setModuloActivo("");
    setEmpresaActiva(null);
    setEjercicioActivo(null);

    setVista("selectorModulo");
  }

  function cambiarEmpresa() {
    sessionStorage.removeItem("empresaActiva");
    sessionStorage.removeItem("ejercicioActivo");

    setEmpresaActiva(null);
    setEjercicioActivo(null);

    setVista("selectorEmpresa");
  }

  function cambiarEjercicio() {
    sessionStorage.removeItem("ejercicioActivo");

    setEjercicioActivo(null);
    setVista("selectorEjercicio");
  }

  function cerrarSesionVisual() {
    cerrarSesion();

    setModuloActivo("");
    setEmpresaActiva(null);
    setEjercicioActivo(null);
    setUsuario(null);

    setVista("login");
  }

  useEffect(() => {
    if (!usuario) return undefined;

    let activo = true;

    obtenerSesionActualizada()
      .then((usuarioActualizado) => {
        if (activo) {
          setUsuario(usuarioActualizado);
        }
      })
      .catch(() => {
        if (activo) {
          cerrarSesionVisual();
        }
      });

    return () => {
      activo = false;
    };
  }, [usuario?.id]);

  if (vista === "registro") {
    return <Registro irALogin={() => setVista("login")} />;
  }

  if (!usuario) {
    return (
      <Login
        loginCorrecto={loginCorrecto}
      />
    );
  }

  if (requiereActivacionSuscripcion(usuario)) {
    return (
      <RenovarSuscripcion
        usuario={usuario}
        alCerrarSesion={cerrarSesionVisual}
        alSesionActualizada={(usuarioActualizado) => {
          setUsuario(usuarioActualizado);

          if (!requiereActivacionSuscripcion(usuarioActualizado)) {
            setVista("selectorModulo");
          }
        }}
      />
    );
  }

  if (vista === "selectorModulo" || !moduloActivo) {
    return (
      <SelectorModulo
        usuario={usuario}
        seleccionarModulo={seleccionarModulo}
        alCerrarSesion={cerrarSesionVisual}
      />
    );
  }

  if (!esModuloAdministracion(moduloActivo) && (vista === "selectorEmpresa" || !empresaActiva)) {
    return (
      <SelectorEmpresaModulo
        usuario={usuario}
        moduloActivo={moduloActivo}
        alSeleccionarEmpresa={seleccionarEmpresa}
        volverASeleccionModulo={volverASeleccionModulo}
        alCerrarSesion={cerrarSesionVisual}
      />
    );
  }

  if (!esModuloAdministracion(moduloActivo) && (vista === "selectorEjercicio" || !ejercicioActivo)) {
    return (
      <SelectorEjercicio
        usuario={usuario}
        empresaActiva={empresaActiva}
        moduloActivo={moduloActivo}
        alSeleccionarEjercicio={ejercicioSeleccionado}
        volverASeleccionEmpresa={cambiarEmpresa}
        volverASeleccionModulo={volverASeleccionModulo}
        alCerrarSesion={cerrarSesionVisual}
      />
    );
  }

  return (
    <PanelPrincipal
      usuario={usuario}
      moduloActivo={moduloActivo}
      empresaActiva={empresaActiva}
      ejercicioActivo={ejercicioActivo}
      cambiarEmpresa={cambiarEmpresa}
      cambiarEjercicio={cambiarEjercicio}
      volverASeleccionModulo={volverASeleccionModulo}
      alCerrarSesion={cerrarSesionVisual}
    />
  );
}

export default App;
