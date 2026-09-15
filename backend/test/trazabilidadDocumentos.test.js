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
  const detallesInsertados = [];
  const client = {
    async query(sql, params = []) {
      if (String(sql).includes("ALTER TABLE comprobante_detalle")) {
        return { rows: [] };
      }

      if (String(sql).includes("SELECT COALESCE(MAX(numero)")) {
        return { rows: [{ siguiente: 7 }] };
      }

      if (String(sql).includes("INSERT INTO comprobantes")) {
        return { rows: [{ id: 77, numero: 7, tipo: "Venta" }] };
      }

      if (String(sql).includes("INSERT INTO comprobante_detalle")) {
        detallesInsertados.push(params);
        return { rows: [] };
      }

      return { rows: [] };
    },
  };

  await crearComprobanteAutomaticoVenta(
    client,
    {
      empresa_id: 10,
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

  const detalleCliente = detallesInsertados.find(
    (params) => Number(params[1]) === 101
  );

  assert.equal(detalleCliente[5], "9102");
  assert.equal(detalleCliente[7], "16.153.127-8");
});
