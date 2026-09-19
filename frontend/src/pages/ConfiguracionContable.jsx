import { useEffect, useState } from "react";
import { obtenerEmpresaActiva } from "../services/empresaService";
import { listarCuentas } from "../services/cuentaService";
import {
  obtenerConfiguracionContable,
  guardarConfiguracionContable,
} from "../services/configuracionContableService";

export default function ConfiguracionContable() {
  const empresaActiva = obtenerEmpresaActiva();

  const [cuentas, setCuentas] = useState([]);
  const [configuracion, setConfiguracion] = useState({
    cuenta_clientes_id: "",
    cuenta_proveedores_id: "",
    cuenta_caja_banco_id: "",

    cuenta_iva_debito_id: "",
    cuenta_iva_credito_id: "",

    cuenta_ingreso_defecto_id: "",
    cuenta_gasto_defecto_id: "",
    cuenta_otros_impuestos_id: "",

    cuenta_gasto_honorarios_id: "",
    cuenta_retencion_honorarios_id: "",
    cuenta_pago_honorarios_id: "",
    // Contrapartida del cierre de resultados al cerrar el año.
    cuenta_resultado_ejercicio_id: "",

    // Lo que el F29 y el calendario necesitan de la empresa. La tasa de PPM se
    // digitaba en el resumen F29 y no se guardaba.
    tasa_ppm: "0",
    facturador_electronico: true,
    previred_electronico: true,
  });

  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  async function cargarDatos() {
    try {
      setError("");
      setMensaje("");

      const cuentasData = await listarCuentas(empresaActiva.id);
      const configData = await obtenerConfiguracionContable(empresaActiva.id);

      setCuentas(cuentasData.cuentas || []);

      if (configData.configuracion) {
        setConfiguracion({
          cuenta_clientes_id: configData.configuracion.cuenta_clientes_id || "",
          cuenta_proveedores_id:
            configData.configuracion.cuenta_proveedores_id || "",
          cuenta_caja_banco_id:
            configData.configuracion.cuenta_caja_banco_id || "",

          cuenta_iva_debito_id:
            configData.configuracion.cuenta_iva_debito_id || "",
          cuenta_iva_credito_id:
            configData.configuracion.cuenta_iva_credito_id || "",

          cuenta_ingreso_defecto_id:
            configData.configuracion.cuenta_ingreso_defecto_id || "",
          cuenta_gasto_defecto_id:
            configData.configuracion.cuenta_gasto_defecto_id || "",
          cuenta_otros_impuestos_id:
            configData.configuracion.cuenta_otros_impuestos_id || "",

          cuenta_gasto_honorarios_id:
            configData.configuracion.cuenta_gasto_honorarios_id || "",
          cuenta_retencion_honorarios_id:
            configData.configuracion.cuenta_retencion_honorarios_id || "",
          cuenta_pago_honorarios_id:
            configData.configuracion.cuenta_pago_honorarios_id || "",
          cuenta_resultado_ejercicio_id:
            configData.configuracion.cuenta_resultado_ejercicio_id || "",
          tasa_ppm: String(configData.configuracion.tasa_ppm ?? 0),
          facturador_electronico: configData.configuracion.facturador_electronico !== false,
          previred_electronico: configData.configuracion.previred_electronico !== false,
        });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (empresaActiva) {
      cargarDatos();
    }
  }, []);

  function cambiarConfiguracion(e) {
    const { name, value } = e.target;

    setConfiguracion((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  // Evita el doble envío: un segundo clic antes de que responda el servidor
  // creaba el registro dos veces.
  const [guardando, setGuardando] = useState(false);

  async function guardar(e) {
    e.preventDefault();

    if (guardando) return;

    try {
      setGuardando(true);
      setError("");
      setMensaje("");

      const data = await guardarConfiguracionContable({
        empresa_id: empresaActiva.id,

        cuenta_clientes_id: configuracion.cuenta_clientes_id || null,
        cuenta_proveedores_id: configuracion.cuenta_proveedores_id || null,
        cuenta_caja_banco_id: configuracion.cuenta_caja_banco_id || null,

        cuenta_iva_debito_id: configuracion.cuenta_iva_debito_id || null,
        cuenta_iva_credito_id: configuracion.cuenta_iva_credito_id || null,

        cuenta_ingreso_defecto_id:
          configuracion.cuenta_ingreso_defecto_id || null,
        cuenta_gasto_defecto_id: configuracion.cuenta_gasto_defecto_id || null,
        cuenta_otros_impuestos_id:
          configuracion.cuenta_otros_impuestos_id || null,

        cuenta_gasto_honorarios_id:
          configuracion.cuenta_gasto_honorarios_id || null,
        cuenta_retencion_honorarios_id:
          configuracion.cuenta_retencion_honorarios_id || null,
        cuenta_pago_honorarios_id:
          configuracion.cuenta_pago_honorarios_id || null,
        cuenta_resultado_ejercicio_id:
          configuracion.cuenta_resultado_ejercicio_id || null,
        tasa_ppm: Number(configuracion.tasa_ppm || 0),
        facturador_electronico: configuracion.facturador_electronico !== false,
        previred_electronico: configuracion.previred_electronico !== false,
      });

      setMensaje(data.mensaje || "Configuracion guardada correctamente");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  function normalizarTipo(tipo = "") {
    return String(tipo)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function opcionesCuentas(filtroTipo = "") {
    let lista = cuentas;

    if (filtroTipo) {
      if (Array.isArray(filtroTipo)) {
        const filtros = filtroTipo.map(normalizarTipo);
        lista = cuentas.filter((cuenta) =>
          filtros.includes(normalizarTipo(cuenta.tipo))
        );
      } else {
        const filtro = normalizarTipo(filtroTipo);
        lista = cuentas.filter(
          (cuenta) => normalizarTipo(cuenta.tipo) === filtro
        );
      }
    }

    return lista.map((cuenta) => (
      <option key={cuenta.id} value={cuenta.id}>
        {cuenta.codigo} - {cuenta.nombre}
      </option>
    ));
  }

  if (!empresaActiva) {
    return (
      <div>
        <h1 style={titulo}>Configuración Contable</h1>
        <div style={alerta}>
          Debes seleccionar una empresa activa antes de configurar cuentas.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={titulo}>Configuración Contable</h1>

      <p style={subtitulo}>
        Empresa activa: <strong>{empresaActiva.razon_social}</strong>
      </p>

      {mensaje && <p style={ok}>{mensaje}</p>}
      {error && <p style={err}>{error}</p>}

      <form style={cardPrincipal} onSubmit={guardar}>
        <h2 style={tituloSeccion}>Cuentas para asientos automaticos</h2>

        <div style={grid}>
          <CampoCuenta
            label="Cuenta Clientes / Deudores"
            name="cuenta_clientes_id"
            value={configuracion.cuenta_clientes_id}
            onChange={cambiarConfiguracion}
            opciones={opcionesCuentas("Activo")}
          />

          <CampoCuenta
            label="Cuenta Proveedores"
            name="cuenta_proveedores_id"
            value={configuracion.cuenta_proveedores_id}
            onChange={cambiarConfiguracion}
            opciones={opcionesCuentas("Pasivo")}
          />

          <CampoCuenta
            label="Cuenta Caja / Banco"
            name="cuenta_caja_banco_id"
            value={configuracion.cuenta_caja_banco_id}
            onChange={cambiarConfiguracion}
            opciones={opcionesCuentas("Activo")}
          />

          <CampoCuenta
            label="Cuenta IVA Débito Fiscal"
            name="cuenta_iva_debito_id"
            value={configuracion.cuenta_iva_debito_id}
            onChange={cambiarConfiguracion}
            opciones={opcionesCuentas("Pasivo")}
          />

          <CampoCuenta
            label="Cuenta IVA Crédito Fiscal"
            name="cuenta_iva_credito_id"
            value={configuracion.cuenta_iva_credito_id}
            onChange={cambiarConfiguracion}
            opciones={opcionesCuentas("Activo")}
          />

          <CampoCuenta
            label="Cuenta Ingreso por defecto"
            name="cuenta_ingreso_defecto_id"
            value={configuracion.cuenta_ingreso_defecto_id}
            onChange={cambiarConfiguracion}
            opciones={opcionesCuentas(["Ingreso", "Ganancia"])}
          />

          <CampoCuenta
            label="Cuenta Gasto por defecto"
            name="cuenta_gasto_defecto_id"
            value={configuracion.cuenta_gasto_defecto_id}
            onChange={cambiarConfiguracion}
            opciones={opcionesCuentas([
              "Gasto",
              "Costo",
              "Perdida",
              "Activo",
            ])}
          />

          <CampoCuenta
            label="Cuenta Otros Impuestos Compras"
            name="cuenta_otros_impuestos_id"
            value={configuracion.cuenta_otros_impuestos_id}
            onChange={cambiarConfiguracion}
            opciones={opcionesCuentas([
              "Gasto",
              "Costo",
              "Perdida",
              "Activo",
              "Pasivo",
            ])}
          />
        </div>

        <h2 style={tituloSeccionSeparado}>Honorarios</h2>

        <div style={grid}>
          <CampoCuenta
            label="Cuenta Gasto Honorarios"
            name="cuenta_gasto_honorarios_id"
            value={configuracion.cuenta_gasto_honorarios_id}
            onChange={cambiarConfiguracion}
            opciones={opcionesCuentas([
              "Gasto",
              "Costo",
              "Perdida",
            ])}
          />

          <CampoCuenta
            label="Cuenta Retención Honorarios por Pagar"
            name="cuenta_retencion_honorarios_id"
            value={configuracion.cuenta_retencion_honorarios_id}
            onChange={cambiarConfiguracion}
            opciones={opcionesCuentas("Pasivo")}
          />

          <CampoCuenta
            label="Cuenta Pago Honorarios"
            name="cuenta_pago_honorarios_id"
            value={configuracion.cuenta_pago_honorarios_id}
            onChange={cambiarConfiguracion}
            opciones={cuentas.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {cuenta.codigo} - {cuenta.nombre}
              </option>
            ))}
          />

          <CampoCuenta
            label="Cuenta Resultado del Ejercicio (cierre anual)"
            name="cuenta_resultado_ejercicio_id"
            value={configuracion.cuenta_resultado_ejercicio_id}
            onChange={cambiarConfiguracion}
            opciones={opcionesCuentas(["Patrimonio", "Pasivo"])}
          />
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 18, marginBottom: 18 }}>
          <h3 style={{ margin: 0, color: "var(--sc-primary)", fontSize: 16 }}>Tributario</h3>

          <label style={{ display: "grid", gap: 4, maxWidth: 260 }}>
            <span style={{ fontWeight: "bold", fontSize: 13 }}>Tasa de PPM (%)</span>
            <input
              className="sc-input"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={configuracion.tasa_ppm}
              onChange={(e) => setConfiguracion({ ...configuracion, tasa_ppm: e.target.value })}
            />
            <span style={{ fontSize: 12, color: "var(--sc-muted)" }}>
              Sobre ingresos brutos del mes. El sistema no la deduce: la define el régimen de la empresa.
            </span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={configuracion.facturador_electronico}
              onChange={(e) =>
                setConfiguracion({ ...configuracion, facturador_electronico: e.target.checked })
              }
            />
            Emite solo documentos electrónicos y paga por internet (F29 hasta el 20)
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={configuracion.previred_electronico}
              onChange={(e) =>
                setConfiguracion({ ...configuracion, previred_electronico: e.target.checked })
              }
            />
            Paga las cotizaciones en Previred (hasta el 13)
          </label>
        </div>

        <button type="submit" style={botonGuardar} disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar configuración"}
        </button>
      </form>

      <div style={infoBox}>
        <h3 style={subtituloInfo}>Uso de esta configuración:</h3>

        <p style={textoInfo}>
          Estas cuentas se usaran para generar automaticamente comprobantes
          contables desde ventas, compras, importaciones CSV del SII y
          honorarios.
        </p>

        <ul style={listaInfo}>
          <li>
            <strong>Ventas:</strong> clientes, ingresos e IVA débito fiscal.
          </li>
          <li>
            <strong>Compras:</strong> proveedores, gastos e IVA crédito fiscal.
          </li>
          <li>
            <strong>Honorarios:</strong> gasto honorarios, retención por pagar y
            pago honorarios.
          </li>
        </ul>
      </div>
    </div>
  );
}

function CampoCuenta({ label, name, value, onChange, opciones }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>

      <select style={selectStyle} name={name} value={value} onChange={onChange}>
        <option value="">Seleccionar cuenta</option>
        {opciones}
      </select>
    </div>
  );
}

const titulo = {
  fontSize: "32px",
  color: "var(--sc-ink)",
  marginBottom: "5px",
};

const subtitulo = {
  color: "var(--sc-gris)",
  marginBottom: "18px",
};

const cardPrincipal = {
  background: "white",
  borderRadius: "18px",
  padding: "25px",
  boxShadow: "0 14px 32px rgba(3, 105, 161, 0.12)",
  marginBottom: "20px",
};

const tituloSeccion = {
  color: "var(--sc-azul)",
  marginTop: 0,
  marginBottom: "18px",
};

const tituloSeccionSeparado = {
  color: "var(--sc-azul)",
  marginTop: "28px",
  marginBottom: "18px",
  paddingTop: "18px",
  borderTop: "1px solid var(--sc-borde-claro)",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: "16px",
};

const labelStyle = {
  display: "block",
  fontWeight: "bold",
  color: "var(--sc-text)",
  marginBottom: "6px",
};

const selectStyle = {
  width: "100%",
  padding: "10px",
  border: "1px solid var(--sc-celeste-borde)",
  borderRadius: "9px",
  height: "40px",
  boxSizing: "border-box",
};

const botonGuardar = {
  marginTop: "22px",
  background: "var(--sc-teal)",
  color: "white",
  border: "none",
  padding: "12px 18px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const infoBox = {
  background: "white",
  borderRadius: "16px",
  padding: "20px",
  boxShadow: "0 8px 25px rgba(0,0,0,0.06)",
  border: "1px solid var(--sc-borde-claro)",
};

const subtituloInfo = {
  marginTop: 0,
  color: "var(--sc-text)",
};

const textoInfo = {
  color: "var(--sc-text)",
  marginBottom: "10px",
};

const listaInfo = {
  color: "var(--sc-text)",
  lineHeight: "1.7",
};

const ok = {
  color: "var(--sc-teal)",
  fontWeight: "bold",
};

const err = {
  color: "var(--sc-danger)",
  fontWeight: "bold",
};

const alerta = {
  marginTop: "25px",
  background: "var(--sc-naranja-fondo)",
  border: "1px solid #fed7aa",
  color: "var(--sc-naranja-texto)",
  padding: "16px",
  borderRadius: "14px",
  fontWeight: "bold",
};

