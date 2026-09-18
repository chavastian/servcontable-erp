const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizarRutDocumento,
  normalizarRutDocumentoOpcional,
} = require("../src/helpers/trazabilidadRut.helper");
const {
  crearComprobanteAutomaticoVenta,
  __comprobanteInternals,
} = require("../src/helpers/comprobante.helper");

test("normaliza RUT de documento a formato unico visible", () => {
  assert.equal(
    normalizarRutDocumento("161531278", "RUT del proveedor"),
    "16.153.127-8"
  );
  assert.equal(
    normalizarRutDocumentoOpcional("16.153.1278"),
    "16.153.127-8"
  );
});

test("rechaza RUT de documento invalido como error de validacion", () => {
  assert.throws(
    () => normalizarRutDocumento("16.153.127-9", "RUT del cliente"),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /digito verificador/i);
      return true;
    }
  );
});

test("asiento automatico de compra conserva folio y RUT auxiliar del proveedor", () => {
  const asiento = __comprobanteInternals.construirAsientoCompra(
    {
      empresa_id: 10,
      periodo: "2026-09",
      fecha: "2026-09-15",
      folio: "4587",
      rut_proveedor: "161531278",
      razon_social_proveedor: "Proveedor Demo SpA",
      neto: 100000,
      exento: 0,
      iva_credito: 19000,
      iva_no_recuperable: 0,
      otros_impuestos: 0,
      total: 119000,
      cuenta_gasto_id: 501,
    },
    {
      cuenta_proveedores_id: 201,
      cuenta_gasto_defecto_id: 500,
      cuenta_iva_credito_id: 111,
    }
  );

  const detalleProveedor = asiento.detalles.find(
    (detalle) => Number(detalle.cuenta_id) === 201
  );
  const detalleGasto = asiento.detalles.find(
    (detalle) => Number(detalle.cuenta_id) === 501
  );

  assert.equal(asiento.tipo, "Compra");
  assert.equal(detalleGasto.folio, "4587");
  assert.equal(detalleProveedor.folio, "4587");
  assert.equal(detalleProveedor.rut_auxiliar, "16.153.127-8");
  assert.equal(detalleProveedor.haber, 119000);
});

test("comprobante automatico de venta traspasa folio y RUT auxiliar al cliente", async () => {
  // insertarDetallesComprobante ahora escribe todas las lineas en una sola
  // sentencia, con un arreglo por columna, y antes comprueba que las cuentas
  // imputadas pertenezcan a la empresa del comprobante. El cliente simulado
  // responde a esas dos consultas.
  const empresaId = 10;
  const cuentasDeLaEmpresa = [101, 221, 700, 701];
  let lineas = null;

  const client = {
    async query(sql, params = []) {
      const texto = String(sql);

      if (texto.includes("SELECT COALESCE(MAX(numero)")) {
        return { rows: [{ siguiente: 7 }] };
      }

      if (texto.includes("INSERT INTO comprobantes")) {
        return { rows: [{ id: 77, numero: 7, tipo: "Venta" }] };
      }

      if (texto.includes("SELECT empresa_id FROM comprobantes")) {
        return { rows: [{ empresa_id: empresaId }] };
      }

      if (texto.includes("FROM plan_cuentas WHERE id = ANY")) {
        const pedidas = params[0] || [];
        return {
          rows: pedidas
            .filter((id) => cuentasDeLaEmpresa.includes(Number(id)))
            .map((id) => ({ id })),
        };
      }

      if (texto.includes("INSERT INTO comprobante_detalle")) {
        // [comprobanteId, cuentas, glosas, debes, haberes, folios, centros, ruts]
        lineas = params;
        return { rows: [] };
      }

      return { rows: [] };
    },
  };

  await crearComprobanteAutomaticoVenta(
    client,
    {
      empresa_id: empresaId,
      periodo: "2026-09",
      fecha: "2026-09-15",
      folio: "9102",
      rut_cliente: "161531278",
      razon_social_cliente: "Cliente Demo SpA",
      neto: 200000,
      exento: 0,
      iva: 38000,
      total: 238000,
      cuenta_ingreso_id: 701,
    },
    {
      cuenta_clientes_id: 101,
      cuenta_ingreso_defecto_id: 700,
      cuenta_iva_debito_id: 221,
    }
  );

  assert.ok(lineas, "debe haberse escrito el detalle del comprobante");

  const [, cuentas, , , , folios, , ruts] = lineas;
  const posicionCliente = cuentas.findIndex((cuenta) => Number(cuenta) === 101);

  assert.notEqual(posicionCliente, -1, "debe existir la linea de la cuenta de clientes");
  assert.equal(folios[posicionCliente], "9102");
  assert.equal(ruts[posicionCliente], "16.153.127-8");
});

test("no se escribe el asiento si una cuenta es de otra empresa", async () => {
  // La comprobacion vive en insertarDetallesComprobante justamente para que
  // ninguna de las rutas que generan asientos automaticos pueda saltarsela.
  let seEscribioDetalle = false;

  const client = {
    async query(sql, params = []) {
      const texto = String(sql);

      if (texto.includes("SELECT COALESCE(MAX(numero)")) {
        return { rows: [{ siguiente: 7 }] };
      }

      if (texto.includes("INSERT INTO comprobantes")) {
        return { rows: [{ id: 77, numero: 7, tipo: "Venta" }] };
      }

      if (texto.includes("SELECT empresa_id FROM comprobantes")) {
        return { rows: [{ empresa_id: 10 }] };
      }

      if (texto.includes("FROM plan_cuentas WHERE id = ANY")) {
        // La cuenta de ingresos 701 no pertenece a la empresa 10.
        const pedidas = params[0] || [];
        return {
          rows: pedidas
            .filter((id) => Number(id) !== 701)
            .map((id) => ({ id })),
        };
      }

      if (texto.includes("INSERT INTO comprobante_detalle")) {
        seEscribioDetalle = true;
        return { rows: [] };
      }

      return { rows: [] };
    },
  };

  await assert.rejects(
    () =>
      crearComprobanteAutomaticoVenta(
        client,
        {
          empresa_id: 10,
          periodo: "2026-09",
          fecha: "2026-09-15",
          folio: "9102",
          rut_cliente: "161531278",
          neto: 200000,
          exento: 0,
          iva: 38000,
          total: 238000,
          cuenta_ingreso_id: 701,
        },
        {
          cuenta_clientes_id: 101,
          cuenta_ingreso_defecto_id: 700,
          cuenta_iva_debito_id: 221,
        }
      ),
    (error) => {
      assert.match(error.message, /no pertenece a la empresa/i);
      assert.equal(error.statusCode, 400);
      return true;
    }
  );

  assert.equal(seEscribioDetalle, false, "no debe escribirse ninguna linea");
});
