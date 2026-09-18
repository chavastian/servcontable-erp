-- Esquema base de ServContable PRO
-- Generado por introspección de la base de producción (Render, PostgreSQL 18.4).
-- NO editar a mano para cambiar la base: todo cambio va en database/migrations/.
-- Este archivo es el punto de partida de una instalación limpia y la referencia del esquema.
-- Tablas: 37 · claves foráneas: 76 · índices: 77

BEGIN;

-- ------------------------------------------------------------------------
-- auditoria_movimientos   (101 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria_movimientos (
  id SERIAL NOT NULL,
  empresa_id INTEGER,
  usuario_id INTEGER,
  usuario_email TEXT,
  modulo VARCHAR(120) NOT NULL,
  accion VARCHAR(120) NOT NULL,
  detalle TEXT NOT NULL DEFAULT ''::text,
  tabla_afectada VARCHAR(120),
  registro_id INTEGER,
  datos JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- ------------------------------------------------------------------------
-- conciliacion_bancaria_movimientos   (98 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conciliacion_bancaria_movimientos (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  fecha DATE NOT NULL,
  descripcion TEXT NOT NULL DEFAULT ''::text,
  documento TEXT NOT NULL DEFAULT ''::text,
  cargo NUMERIC(14,2) NOT NULL DEFAULT 0,
  abono NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  saldo NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'::character varying,
  comprobante_id INTEGER,
  creado_en TIMESTAMP NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- ------------------------------------------------------------------------
-- contrataciones_web   (6 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contrataciones_web (
  id SERIAL NOT NULL,
  nombre VARCHAR(180) NOT NULL,
  correo VARCHAR(220) NOT NULL,
  telefono VARCHAR(80),
  rut VARCHAR(40),
  empresa VARCHAR(220),
  periodicidad VARCHAR(30) NOT NULL DEFAULT 'mensual'::character varying,
  monto_neto INTEGER NOT NULL DEFAULT 0,
  iva INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  estado VARCHAR(60) NOT NULL DEFAULT 'pendiente'::character varying,
  mp_preference_id VARCHAR(160),
  mp_payment_id VARCHAR(160),
  mp_status VARCHAR(80),
  mp_status_detail VARCHAR(160),
  origen VARCHAR(80) DEFAULT 'web'::character varying,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  flow_token VARCHAR(220),
  flow_order VARCHAR(120),
  flow_status VARCHAR(80),
  PRIMARY KEY (id)
);

-- ------------------------------------------------------------------------
-- empresas   (15 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
  id SERIAL NOT NULL,
  rut VARCHAR(20) NOT NULL,
  razon_social VARCHAR(200) NOT NULL,
  giro TEXT,
  direccion TEXT,
  comuna VARCHAR(100),
  ciudad VARCHAR(100),
  regimen_tributario VARCHAR(100),
  activa BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  telefono VARCHAR(80),
  correo VARCHAR(180),
  descripcion_actividad TEXT,
  rut_representante VARCHAR(30),
  representante_legal VARCHAR(180),
  correo_representante VARCHAR(180),
  telefono_representante VARCHAR(80),
  PRIMARY KEY (id)
);

-- ------------------------------------------------------------------------
-- pagos_mercadopago   (7 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos_mercadopago (
  id SERIAL NOT NULL,
  external_reference VARCHAR(120) NOT NULL,
  preference_id VARCHAR(200),
  mp_payment_id VARCHAR(200),
  estado VARCHAR(80) DEFAULT 'pendiente'::character varying,
  estado_detalle VARCHAR(150),
  plan VARCHAR(80),
  nombre VARCHAR(200),
  correo VARCHAR(200),
  empresa VARCHAR(200),
  monto NUMERIC(14,2),
  moneda VARCHAR(10) DEFAULT 'CLP'::character varying,
  init_point TEXT,
  raw_response JSONB,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  estado_plan VARCHAR(80) DEFAULT 'pendiente'::character varying,
  rut VARCHAR(40),
  telefono VARCHAR(80),
  mensaje TEXT,
  subtotal_neto NUMERIC(14,2),
  iva NUMERIC(14,2),
  usuarios_adicionales INTEGER DEFAULT 0,
  meses_cobrados INTEGER DEFAULT 1,
  usuario_id INTEGER,
  tipo_operacion VARCHAR(50) DEFAULT 'contratacion'::character varying,
  PRIMARY KEY (id),
  CONSTRAINT pagos_mercadopago_external_reference_key UNIQUE (external_reference)
);

-- ------------------------------------------------------------------------
-- solicitudes_contacto   (16 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitudes_contacto (
  id SERIAL NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  correo VARCHAR(200) NOT NULL,
  empresa VARCHAR(200),
  interes VARCHAR(150),
  mensaje TEXT,
  estado VARCHAR(50) DEFAULT 'pendiente'::character varying,
  origen VARCHAR(100) DEFAULT 'web'::character varying,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  leido BOOLEAN DEFAULT false,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  nota_interna TEXT,
  demo_usuario_id INTEGER,
  demo_inicio DATE,
  demo_vence DATE,
  demo_activado_en TIMESTAMP,
  rut VARCHAR(30),
  rut_normalizado VARCHAR(20),
  telefono VARCHAR(80),
  usuario_id INTEGER,
  empresa_id INTEGER,
  subscription_id INTEGER,
  trial_inicio DATE,
  trial_vence DATE,
  archivado BOOLEAN DEFAULT false,
  PRIMARY KEY (id)
);

-- ------------------------------------------------------------------------
-- subscription_plans   (5 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL NOT NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  monthly_price INTEGER NOT NULL DEFAULT 0,
  annual_price INTEGER NOT NULL DEFAULT 0,
  max_companies INTEGER,
  max_users INTEGER,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  trial_days INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT subscription_plans_code_key UNIQUE (code)
);

-- ------------------------------------------------------------------------
-- subscription_settings   (13 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_settings (
  key VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (key)
);

-- ------------------------------------------------------------------------
-- usuarios   (15 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password_hash TEXT NOT NULL,
  rol VARCHAR(50) DEFAULT 'admin'::character varying,
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  suscripcion_estado VARCHAR(30) NOT NULL DEFAULT 'activa'::character varying,
  suscripcion_plan VARCHAR(30) NOT NULL DEFAULT 'mensual'::character varying,
  suscripcion_inicio DATE,
  suscripcion_vence DATE,
  suscripcion_usuarios_adicionales INTEGER NOT NULL DEFAULT 0,
  suscripcion_pago_external_reference VARCHAR(120),
  suscripcion_actualizada_en TIMESTAMP DEFAULT now(),
  demo_activo BOOLEAN NOT NULL DEFAULT false,
  demo_inicio DATE,
  demo_vence DATE,
  demo_empresa_limite INTEGER NOT NULL DEFAULT 1,
  demo_solicitud_id INTEGER,
  demo_origen VARCHAR(80),
  ultimo_acceso_en TIMESTAMP,
  rut VARCHAR(30),
  rut_normalizado VARCHAR(20),
  telefono VARCHAR(80),
  PRIMARY KEY (id),
  CONSTRAINT usuarios_email_key UNIQUE (email)
);

-- ------------------------------------------------------------------------
-- admin_audit_logs   (4 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id SERIAL NOT NULL,
  admin_user_id INTEGER,
  admin_email VARCHAR(220),
  customer_user_id INTEGER,
  action VARCHAR(120) NOT NULL,
  previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(120),
  observation TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT admin_audit_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT admin_audit_logs_customer_user_id_fkey FOREIGN KEY (customer_user_id) REFERENCES usuarios (id) ON DELETE SET NULL
);

-- ------------------------------------------------------------------------
-- afp_parametros   (127 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS afp_parametros (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  tasa_afp NUMERIC(8,4) DEFAULT 0,
  tasa_sis NUMERIC(8,4) DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT now(),
  actualizado_en TIMESTAMP DEFAULT now(),
  tasa_seguro_social NUMERIC(12,4) DEFAULT 1,
  tasa_empleador NUMERIC(12,4) DEFAULT 0,
  tasa_total NUMERIC(12,4) DEFAULT 0,
  tasa_independiente NUMERIC(12,4) DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT afp_parametros_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id)
);

-- ------------------------------------------------------------------------
-- comprobantes   (115 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comprobantes (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  fecha DATE NOT NULL,
  tipo VARCHAR(50) NOT NULL DEFAULT 'Traspaso'::character varying,
  numero INTEGER NOT NULL,
  glosa TEXT,
  total_debe NUMERIC(14,2) DEFAULT 0,
  total_haber NUMERIC(14,2) DEFAULT 0,
  estado VARCHAR(50) DEFAULT 'vigente'::character varying,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT comprobantes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE,
  CONSTRAINT comprobantes_empresa_id_tipo_numero_key UNIQUE (empresa_id, tipo, numero)
);

-- ------------------------------------------------------------------------
-- conceptos_remuneracion   (0 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conceptos_remuneracion (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  imponible BOOLEAN DEFAULT false,
  tributable BOOLEAN DEFAULT false,
  proporcional_dias BOOLEAN DEFAULT false,
  afecta_gratificacion BOOLEAN DEFAULT false,
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT conceptos_remuneracion_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id)
);

-- ------------------------------------------------------------------------
-- ejercicios_contables   (14 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ejercicios_contables (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  anio INTEGER NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'abierto'::character varying,
  fecha_inicio DATE,
  fecha_termino DATE,
  fecha_cierre TIMESTAMP,
  observacion TEXT DEFAULT ''::text,
  creado_en TIMESTAMP DEFAULT now(),
  actualizado_en TIMESTAMP DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT ejercicios_contables_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE,
  CONSTRAINT ejercicios_contables_empresa_id_anio_key UNIQUE (empresa_id, anio)
);

-- ------------------------------------------------------------------------
-- impuesto_unico_tramos   (14 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS impuesto_unico_tramos (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  desde NUMERIC(18,2) DEFAULT 0,
  hasta NUMERIC(18,2) DEFAULT 0,
  factor NUMERIC(12,6) DEFAULT 0,
  rebaja NUMERIC(18,2) DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT impuesto_unico_tramos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id)
);

-- ------------------------------------------------------------------------
-- password_reset_tokens   (4 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL NOT NULL,
  usuario_id INTEGER NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  vence_en TIMESTAMP NOT NULL,
  usado_en TIMESTAMP,
  solicitado_en TIMESTAMP NOT NULL DEFAULT now(),
  ip_solicitud VARCHAR(120),
  user_agent TEXT,
  PRIMARY KEY (id),
  CONSTRAINT password_reset_tokens_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash)
);

-- ------------------------------------------------------------------------
-- plan_cuentas   (1619 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_cuentas (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  codigo VARCHAR(50) NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  clasificacion VARCHAR(100),
  naturaleza VARCHAR(20) NOT NULL,
  nivel INTEGER DEFAULT 1,
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT plan_cuentas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE,
  CONSTRAINT plan_cuentas_empresa_id_codigo_key UNIQUE (empresa_id, codigo)
);

-- ------------------------------------------------------------------------
-- remanente_iva   (1 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS remanente_iva (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  remanente_anterior NUMERIC(14,2) DEFAULT 0,
  iva_debito NUMERIC(14,2) DEFAULT 0,
  iva_credito NUMERIC(14,2) DEFAULT 0,
  iva_disponible NUMERIC(14,2) DEFAULT 0,
  iva_determinado NUMERIC(14,2) DEFAULT 0,
  iva_pagar NUMERIC(14,2) DEFAULT 0,
  remanente_siguiente NUMERIC(14,2) DEFAULT 0,
  observacion TEXT,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT remanente_iva_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE,
  CONSTRAINT remanente_iva_empresa_id_periodo_key UNIQUE (empresa_id, periodo)
);

-- ------------------------------------------------------------------------
-- subscriptions   (1 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL NOT NULL,
  user_id INTEGER NOT NULL,
  plan_id INTEGER,
  status VARCHAR(30) NOT NULL DEFAULT 'TRIAL'::character varying,
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly'::character varying,
  price INTEGER NOT NULL DEFAULT 0,
  currency VARCHAR(12) NOT NULL DEFAULT 'CLP'::character varying,
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  renews_at DATE,
  expires_at DATE,
  trial_starts_at DATE,
  trial_ends_at DATE,
  auto_renew BOOLEAN NOT NULL DEFAULT false,
  grace_days INTEGER NOT NULL DEFAULT 5,
  max_companies_override INTEGER,
  max_users_override INTEGER,
  internal_notes TEXT,
  cancelled_at TIMESTAMP,
  suspended_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans (id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------
-- trabajadores   (7 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trabajadores (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  rut VARCHAR(20) NOT NULL,
  nombres VARCHAR(120) NOT NULL,
  apellidos VARCHAR(120),
  fecha_nacimiento DATE,
  nacionalidad VARCHAR(80),
  cargo VARCHAR(150),
  centro_costo VARCHAR(150),
  fecha_ingreso DATE NOT NULL,
  fecha_termino DATE,
  tipo_contrato VARCHAR(50) DEFAULT 'Indefinido'::character varying,
  jornada VARCHAR(80),
  sueldo_base NUMERIC(18,2) DEFAULT 0,
  afp VARCHAR(100),
  salud VARCHAR(100),
  tramo_asignacion VARCHAR(20),
  cargas INTEGER DEFAULT 0,
  banco VARCHAR(100),
  tipo_cuenta VARCHAR(80),
  numero_cuenta VARCHAR(80),
  email VARCHAR(150),
  telefono VARCHAR(50),
  estado VARCHAR(20) DEFAULT 'activo'::character varying,
  creado_en TIMESTAMP DEFAULT now(),
  sexo VARCHAR(20) DEFAULT ''::character varying,
  codigo_afp_previred VARCHAR(20) DEFAULT ''::character varying,
  codigo_salud_previred VARCHAR(20) DEFAULT ''::character varying,
  codigo_mutual_previred VARCHAR(20) DEFAULT ''::character varying,
  regimen_previsional VARCHAR(50) DEFAULT 'AFP'::character varying,
  tipo_trabajador_previred VARCHAR(20) DEFAULT '0'::character varying,
  tipo_contrato_previred VARCHAR(20) DEFAULT '1'::character varying,
  seguro_cesantia VARCHAR(10) DEFAULT 'SI'::character varying,
  movimiento_personal VARCHAR(20) DEFAULT '0'::character varying,
  fecha_movimiento_desde DATE,
  fecha_movimiento_hasta DATE,
  PRIMARY KEY (id),
  CONSTRAINT trabajadores_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id)
);

-- ------------------------------------------------------------------------
-- usuarios_empresas   (17 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios_empresas (
  id SERIAL NOT NULL,
  usuario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  rol_empresa VARCHAR(50) NOT NULL DEFAULT 'usuario'::character varying,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMP NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT usuarios_empresas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE,
  CONSTRAINT usuarios_empresas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT usuarios_empresas_usuario_id_empresa_id_key UNIQUE (usuario_id, empresa_id)
);

-- ------------------------------------------------------------------------
-- compras   (36 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  fecha DATE NOT NULL,
  tipo_documento VARCHAR(50) NOT NULL,
  folio VARCHAR(50),
  rut_proveedor VARCHAR(20),
  razon_social_proveedor VARCHAR(200),
  neto NUMERIC(14,2) DEFAULT 0,
  exento NUMERIC(14,2) DEFAULT 0,
  iva_credito NUMERIC(14,2) DEFAULT 0,
  iva_no_recuperable NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  cuenta_gasto_id INTEGER,
  estado VARCHAR(50) DEFAULT 'vigente'::character varying,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  comprobante_id INTEGER,
  sii_tipo_doc VARCHAR(20),
  neto_afecto NUMERIC(18,2) DEFAULT 0,
  otros_impuestos NUMERIC DEFAULT 0,
  cuenta_otros_impuestos_id INTEGER,
  PRIMARY KEY (id),
  CONSTRAINT compras_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES comprobantes (id),
  CONSTRAINT compras_cuenta_gasto_id_fkey FOREIGN KEY (cuenta_gasto_id) REFERENCES plan_cuentas (id),
  CONSTRAINT compras_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------
-- comprobante_detalle   (421 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comprobante_detalle (
  id SERIAL NOT NULL,
  comprobante_id INTEGER NOT NULL,
  cuenta_id INTEGER NOT NULL,
  glosa TEXT,
  debe NUMERIC(14,2) DEFAULT 0,
  haber NUMERIC(14,2) DEFAULT 0,
  folio VARCHAR(50),
  centro_costo VARCHAR(150),
  rut_auxiliar VARCHAR(20),
  PRIMARY KEY (id),
  CONSTRAINT comprobante_detalle_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES comprobantes (id) ON DELETE CASCADE,
  CONSTRAINT comprobante_detalle_cuenta_id_fkey FOREIGN KEY (cuenta_id) REFERENCES plan_cuentas (id)
);

-- ------------------------------------------------------------------------
-- configuracion_contable   (3 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion_contable (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  cuenta_clientes_id INTEGER,
  cuenta_proveedores_id INTEGER,
  cuenta_caja_banco_id INTEGER,
  cuenta_iva_debito_id INTEGER,
  cuenta_iva_credito_id INTEGER,
  cuenta_ingreso_defecto_id INTEGER,
  cuenta_gasto_defecto_id INTEGER,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cuenta_gasto_honorarios_id INTEGER,
  cuenta_retencion_honorarios_id INTEGER,
  cuenta_pago_honorarios_id INTEGER,
  cuenta_otros_impuestos_id INTEGER,
  PRIMARY KEY (id),
  CONSTRAINT configuracion_contable_cuenta_caja_banco_id_fkey FOREIGN KEY (cuenta_caja_banco_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_contable_cuenta_clientes_id_fkey FOREIGN KEY (cuenta_clientes_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_contable_cuenta_gasto_defecto_id_fkey FOREIGN KEY (cuenta_gasto_defecto_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_contable_cuenta_gasto_honorarios_id_fkey FOREIGN KEY (cuenta_gasto_honorarios_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_contable_cuenta_ingreso_defecto_id_fkey FOREIGN KEY (cuenta_ingreso_defecto_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_contable_cuenta_iva_credito_id_fkey FOREIGN KEY (cuenta_iva_credito_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_contable_cuenta_iva_debito_id_fkey FOREIGN KEY (cuenta_iva_debito_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_contable_cuenta_pago_honorarios_id_fkey FOREIGN KEY (cuenta_pago_honorarios_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_contable_cuenta_proveedores_id_fkey FOREIGN KEY (cuenta_proveedores_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_contable_cuenta_retencion_honorarios_id_fkey FOREIGN KEY (cuenta_retencion_honorarios_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_contable_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE,
  CONSTRAINT configuracion_contable_empresa_id_key UNIQUE (empresa_id)
);

-- ------------------------------------------------------------------------
-- configuracion_remuneraciones   (9 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion_remuneraciones (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  tasa_salud NUMERIC(8,4) DEFAULT 7.0000,
  tasa_sis NUMERIC(8,4) DEFAULT 0,
  tasa_afc_trabajador NUMERIC(8,4) DEFAULT 0,
  tasa_afc_empleador NUMERIC(8,4) DEFAULT 0,
  tasa_mutual NUMERIC(8,4) DEFAULT 0,
  tope_imponible_uf NUMERIC(12,4) DEFAULT 0,
  valor_uf NUMERIC(18,2) DEFAULT 0,
  ingreso_minimo NUMERIC(18,2) DEFAULT 0,
  tramo_asignacion_a NUMERIC(18,2) DEFAULT 0,
  tramo_asignacion_b NUMERIC(18,2) DEFAULT 0,
  tramo_asignacion_c NUMERIC(18,2) DEFAULT 0,
  cuenta_sueldos_id INTEGER,
  cuenta_afp_id INTEGER,
  cuenta_salud_id INTEGER,
  cuenta_afc_id INTEGER,
  cuenta_mutual_id INTEGER,
  cuenta_sueldos_por_pagar_id INTEGER,
  cuenta_banco_pago_id INTEGER,
  creado_en TIMESTAMP DEFAULT now(),
  actualizado_en TIMESTAMP DEFAULT now(),
  cuenta_impuesto_unico_id INTEGER,
  cuenta_indemnizaciones_id INTEGER,
  cuenta_finiquito_por_pagar_id INTEGER,
  cuenta_descuentos_finiquito_id INTEGER,
  cuenta_sis_empleador_id INTEGER,
  cuenta_afc_empleador_id INTEGER,
  cuenta_mutual_empleador_id INTEGER,
  cuenta_otros_descuentos_id INTEGER,
  mutual_nombre VARCHAR(120) DEFAULT ''::character varying,
  mutual_codigo_previred VARCHAR(2) DEFAULT '0'::character varying,
  mutual_sucursal_previred VARCHAR(3) DEFAULT '0'::character varying,
  indicadores_previsionales JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY (id),
  CONSTRAINT configuracion_remuneraciones_cuenta_afc_id_fkey FOREIGN KEY (cuenta_afc_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_remuneraciones_cuenta_afp_id_fkey FOREIGN KEY (cuenta_afp_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_remuneraciones_cuenta_banco_pago_id_fkey FOREIGN KEY (cuenta_banco_pago_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_remuneraciones_cuenta_descuentos_finiquito_i_fkey FOREIGN KEY (cuenta_descuentos_finiquito_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_remuneraciones_cuenta_finiquito_por_pagar_id_fkey FOREIGN KEY (cuenta_finiquito_por_pagar_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_remuneraciones_cuenta_impuesto_unico_id_fkey FOREIGN KEY (cuenta_impuesto_unico_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_remuneraciones_cuenta_indemnizaciones_id_fkey FOREIGN KEY (cuenta_indemnizaciones_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_remuneraciones_cuenta_mutual_id_fkey FOREIGN KEY (cuenta_mutual_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_remuneraciones_cuenta_salud_id_fkey FOREIGN KEY (cuenta_salud_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_remuneraciones_cuenta_sueldos_id_fkey FOREIGN KEY (cuenta_sueldos_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_remuneraciones_cuenta_sueldos_por_pagar_id_fkey FOREIGN KEY (cuenta_sueldos_por_pagar_id) REFERENCES plan_cuentas (id),
  CONSTRAINT configuracion_remuneraciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id)
);

-- ------------------------------------------------------------------------
-- finiquitos   (3 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finiquitos (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  trabajador_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  fecha_termino DATE NOT NULL,
  causal VARCHAR(200) NOT NULL,
  dias_trabajados_mes NUMERIC(10,2) DEFAULT 0,
  sueldo_base NUMERIC(18,2) DEFAULT 0,
  sueldo_pendiente NUMERIC(18,2) DEFAULT 0,
  vacaciones_pendientes NUMERIC(10,2) DEFAULT 0,
  valor_dia_vacaciones NUMERIC(18,2) DEFAULT 0,
  vacaciones_proporcionales NUMERIC(18,2) DEFAULT 0,
  indemnizacion_aviso_previo NUMERIC(18,2) DEFAULT 0,
  indemnizacion_anios_servicio NUMERIC(18,2) DEFAULT 0,
  otros_haberes NUMERIC(18,2) DEFAULT 0,
  descuentos NUMERIC(18,2) DEFAULT 0,
  total_haberes NUMERIC(18,2) DEFAULT 0,
  total_finiquito NUMERIC(18,2) DEFAULT 0,
  observacion TEXT,
  contabilizado BOOLEAN DEFAULT false,
  comprobante_id INTEGER,
  estado VARCHAR(30) DEFAULT 'vigente'::character varying,
  creado_en TIMESTAMP DEFAULT now(),
  actualizado_en TIMESTAMP DEFAULT now(),
  fecha_aviso DATE,
  fecha_pago DATE,
  sueldo_indemnizable NUMERIC(18,2) DEFAULT 0,
  anios_servicio NUMERIC(10,2) DEFAULT 0,
  indemnizacion_voluntaria NUMERIC(18,2) DEFAULT 0,
  seguro_cesantia_descuento NUMERIC(18,2) DEFAULT 0,
  otros_descuentos NUMERIC(18,2) DEFAULT 0,
  revisado BOOLEAN DEFAULT false,
  pagado BOOLEAN DEFAULT false,
  base_vacaciones NUMERIC(18,2) DEFAULT 0,
  base_indemnizacion NUMERIC(18,2) DEFAULT 0,
  meses_servicio NUMERIC(10,2) DEFAULT 0,
  dias_servicio NUMERIC(10,2) DEFAULT 0,
  observacion_sueldo_pendiente TEXT,
  observacion_vacaciones TEXT,
  observacion_aviso_previo TEXT,
  observacion_anios_servicio TEXT,
  observacion_indemnizacion_voluntaria TEXT,
  observacion_otros_haberes TEXT,
  observacion_descuentos TEXT,
  dias_vacaciones_devengadas NUMERIC(10,2) DEFAULT 0,
  dias_vacaciones_usadas NUMERIC(10,2) DEFAULT 0,
  dias_vacaciones_pendientes NUMERIC(10,2) DEFAULT 0,
  dias_vacaciones_a_pagar NUMERIC(10,2) DEFAULT 0,
  monto_vacaciones_pendientes NUMERIC(18,2) DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT finiquitos_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES comprobantes (id),
  CONSTRAINT finiquitos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id),
  CONSTRAINT finiquitos_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES trabajadores (id)
);

-- ------------------------------------------------------------------------
-- haberes_descuentos_remuneraciones   (22 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS haberes_descuentos_remuneraciones (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  trabajador_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  monto NUMERIC(18,2) DEFAULT 0,
  imponible BOOLEAN DEFAULT false,
  tributable BOOLEAN DEFAULT false,
  afecta_descuentos BOOLEAN DEFAULT false,
  observacion TEXT,
  estado VARCHAR(20) DEFAULT 'vigente'::character varying,
  creado_en TIMESTAMP DEFAULT now(),
  recurrente BOOLEAN DEFAULT false,
  PRIMARY KEY (id),
  CONSTRAINT haberes_descuentos_remuneraciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id),
  CONSTRAINT haberes_descuentos_remuneraciones_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES trabajadores (id)
);

-- ------------------------------------------------------------------------
-- honorarios   (2 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS honorarios (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  periodo VARCHAR(7),
  fecha_emision DATE NOT NULL,
  fecha_pago DATE,
  tipo_documento VARCHAR(50) DEFAULT 'Boleta de Honorarios'::character varying,
  folio VARCHAR(50),
  rut_prestador VARCHAR(20),
  nombre_prestador VARCHAR(200),
  glosa TEXT,
  bruto NUMERIC(18,2) DEFAULT 0,
  tasa_retencion NUMERIC(6,2) DEFAULT 0,
  retencion NUMERIC(18,2) DEFAULT 0,
  liquido NUMERIC(18,2) DEFAULT 0,
  estado VARCHAR(20) DEFAULT 'vigente'::character varying,
  created_at TIMESTAMP DEFAULT now(),
  comprobante_id INTEGER,
  contabilizado BOOLEAN DEFAULT false,
  PRIMARY KEY (id),
  CONSTRAINT honorarios_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES comprobantes (id),
  CONSTRAINT honorarios_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id)
);

-- ------------------------------------------------------------------------
-- liquidaciones   (10 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS liquidaciones (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  trabajador_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  dias_trabajados INTEGER DEFAULT 30,
  sueldo_base NUMERIC(18,2) DEFAULT 0,
  gratificacion NUMERIC(18,2) DEFAULT 0,
  total_haberes_imponibles NUMERIC(18,2) DEFAULT 0,
  total_haberes_no_imponibles NUMERIC(18,2) DEFAULT 0,
  total_haberes NUMERIC(18,2) DEFAULT 0,
  descuento_afp NUMERIC(18,2) DEFAULT 0,
  descuento_salud NUMERIC(18,2) DEFAULT 0,
  impuesto_unico NUMERIC(18,2) DEFAULT 0,
  otros_descuentos NUMERIC(18,2) DEFAULT 0,
  total_descuentos NUMERIC(18,2) DEFAULT 0,
  liquido_pagar NUMERIC(18,2) DEFAULT 0,
  estado VARCHAR(20) DEFAULT 'borrador'::character varying,
  comprobante_id INTEGER,
  contabilizada BOOLEAN DEFAULT false,
  creada_en TIMESTAMP DEFAULT now(),
  sueldo_proporcional NUMERIC(18,2) DEFAULT 0,
  base_imponible NUMERIC(18,2) DEFAULT 0,
  tope_imponible_pesos NUMERIC(18,2) DEFAULT 0,
  base_afecta_descuentos NUMERIC(18,2) DEFAULT 0,
  tasa_afp NUMERIC(8,4) DEFAULT 0,
  tasa_salud NUMERIC(8,4) DEFAULT 7,
  tasa_afc_trabajador NUMERIC(8,4) DEFAULT 0,
  tasa_afc_empleador NUMERIC(8,4) DEFAULT 0,
  tasa_sis NUMERIC(8,4) DEFAULT 0,
  tasa_mutual NUMERIC(8,4) DEFAULT 0,
  descuento_afc NUMERIC(18,2) DEFAULT 0,
  aporte_sis_empleador NUMERIC(18,2) DEFAULT 0,
  aporte_afc_empleador NUMERIC(18,2) DEFAULT 0,
  aporte_mutual_empleador NUMERIC(18,2) DEFAULT 0,
  costo_empresa NUMERIC(18,2) DEFAULT 0,
  variables_haberes_imponibles NUMERIC(18,2) DEFAULT 0,
  variables_haberes_no_imponibles NUMERIC(18,2) DEFAULT 0,
  variables_descuentos NUMERIC(18,2) DEFAULT 0,
  base_tributable NUMERIC(18,2) DEFAULT 0,
  tramo_impuesto_unico_id INTEGER,
  factor_impuesto_unico NUMERIC(12,6) DEFAULT 0,
  rebaja_impuesto_unico NUMERIC(18,2) DEFAULT 0,
  dias_ausencia NUMERIC(10,2) DEFAULT 0,
  horas_ausencia NUMERIC(10,2) DEFAULT 0,
  descuento_ausencias NUMERIC(18,2) DEFAULT 0,
  tasa_seguro_social NUMERIC(12,4) DEFAULT 0,
  aporte_seguro_social_empleador NUMERIC(14,2) DEFAULT 0,
  tipo_calculo_horas_extras VARCHAR(30) DEFAULT 'MENSUAL'::character varying,
  horas_extras NUMERIC(12,2) DEFAULT 0,
  base_horas_extras NUMERIC(14,2) DEFAULT 0,
  jornada_horas_semanal NUMERIC(8,2) DEFAULT 42,
  aplica_semana_corrida_horas_extras BOOLEAN DEFAULT false,
  semana_corrida_horas_extras NUMERIC(14,2) DEFAULT 0,
  recargo_horas_extras NUMERIC(8,4) DEFAULT 50,
  valor_hora_extra NUMERIC(14,2) DEFAULT 0,
  monto_horas_extras NUMERIC(14,2) DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT liquidaciones_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES comprobantes (id),
  CONSTRAINT liquidaciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id),
  CONSTRAINT liquidaciones_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES trabajadores (id),
  CONSTRAINT liquidaciones_tramo_impuesto_unico_id_fkey FOREIGN KEY (tramo_impuesto_unico_id) REFERENCES impuesto_unico_tramos (id)
);

-- ------------------------------------------------------------------------
-- pagos_cobros   (27 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos_cobros (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  tipo_movimiento VARCHAR(20) NOT NULL,
  tipo_documento VARCHAR(50),
  documento_id INTEGER,
  fecha DATE NOT NULL,
  periodo VARCHAR(7),
  rut_tercero VARCHAR(20),
  nombre_tercero VARCHAR(200),
  folio VARCHAR(50),
  glosa TEXT,
  monto NUMERIC(18,2) DEFAULT 0,
  cuenta_banco_id INTEGER,
  cuenta_contraparte_id INTEGER,
  comprobante_id INTEGER,
  estado VARCHAR(20) DEFAULT 'vigente'::character varying,
  contabilizado BOOLEAN DEFAULT false,
  creado_en TIMESTAMP DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pagos_cobros_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES comprobantes (id),
  CONSTRAINT pagos_cobros_cuenta_banco_id_fkey FOREIGN KEY (cuenta_banco_id) REFERENCES plan_cuentas (id),
  CONSTRAINT pagos_cobros_cuenta_contraparte_id_fkey FOREIGN KEY (cuenta_contraparte_id) REFERENCES plan_cuentas (id),
  CONSTRAINT pagos_cobros_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id)
);

-- ------------------------------------------------------------------------
-- pagos_remuneraciones   (5 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos_remuneraciones (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  fecha DATE NOT NULL,
  tipo_pago VARCHAR(30) NOT NULL,
  descripcion VARCHAR(200),
  monto NUMERIC(18,2) DEFAULT 0,
  cuenta_debe_id INTEGER,
  cuenta_haber_id INTEGER,
  comprobante_id INTEGER,
  contabilizado BOOLEAN DEFAULT false,
  estado VARCHAR(20) DEFAULT 'vigente'::character varying,
  creado_en TIMESTAMP DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT pagos_remuneraciones_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES comprobantes (id),
  CONSTRAINT pagos_remuneraciones_cuenta_debe_id_fkey FOREIGN KEY (cuenta_debe_id) REFERENCES plan_cuentas (id),
  CONSTRAINT pagos_remuneraciones_cuenta_haber_id_fkey FOREIGN KEY (cuenta_haber_id) REFERENCES plan_cuentas (id),
  CONSTRAINT pagos_remuneraciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id)
);

-- ------------------------------------------------------------------------
-- subscription_history   (2 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_history (
  id SERIAL NOT NULL,
  subscription_id INTEGER,
  user_id INTEGER,
  admin_user_id INTEGER,
  action VARCHAR(80) NOT NULL,
  previous_status VARCHAR(30),
  new_status VARCHAR(30),
  previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  observation TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT subscription_history_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT subscription_history_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON DELETE CASCADE,
  CONSTRAINT subscription_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------
-- subscription_notifications   (0 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_notifications (
  id SERIAL NOT NULL,
  subscription_id INTEGER,
  user_id INTEGER,
  event_type VARCHAR(80) NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  channel VARCHAR(40) NOT NULL DEFAULT 'in_app'::character varying,
  status VARCHAR(40) NOT NULL DEFAULT 'pending'::character varying,
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  read_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT subscription_notifications_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON DELETE CASCADE,
  CONSTRAINT subscription_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------
-- subscription_payments   (0 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_payments (
  id SERIAL NOT NULL,
  subscription_id INTEGER,
  user_id INTEGER,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount INTEGER NOT NULL DEFAULT 0,
  period_label VARCHAR(80),
  payment_method VARCHAR(80),
  status VARCHAR(30) NOT NULL DEFAULT 'PAID'::character varying,
  transaction_id VARCHAR(160),
  tax_document VARCHAR(160),
  notes TEXT,
  provider VARCHAR(80) DEFAULT 'manual'::character varying,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  service_name VARCHAR(160),
  base_price INTEGER NOT NULL DEFAULT 0,
  included_users INTEGER NOT NULL DEFAULT 1,
  active_users INTEGER NOT NULL DEFAULT 0,
  additional_users INTEGER NOT NULL DEFAULT 0,
  additional_user_price INTEGER NOT NULL DEFAULT 0,
  additional_users_amount INTEGER NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0,
  iva_rate NUMERIC(8,4) NOT NULL DEFAULT 0.19,
  iva_amount INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT subscription_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON DELETE SET NULL,
  CONSTRAINT subscription_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------
-- vacaciones_ausencias   (0 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vacaciones_ausencias (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  trabajador_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  subtipo VARCHAR(100),
  fecha_inicio DATE NOT NULL,
  fecha_termino DATE NOT NULL,
  dias NUMERIC(10,2) DEFAULT 0,
  horas NUMERIC(10,2) DEFAULT 0,
  afecta_remuneracion BOOLEAN DEFAULT false,
  descuenta_vacaciones BOOLEAN DEFAULT false,
  monto_descuento NUMERIC(18,2) DEFAULT 0,
  observacion TEXT,
  estado VARCHAR(30) DEFAULT 'vigente'::character varying,
  creado_en TIMESTAMP DEFAULT now(),
  actualizado_en TIMESTAMP DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT vacaciones_ausencias_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id),
  CONSTRAINT vacaciones_ausencias_trabajador_id_fkey FOREIGN KEY (trabajador_id) REFERENCES trabajadores (id)
);

-- ------------------------------------------------------------------------
-- ventas   (17 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ventas (
  id SERIAL NOT NULL,
  empresa_id INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  fecha DATE NOT NULL,
  tipo_documento VARCHAR(50) NOT NULL,
  folio VARCHAR(50),
  rut_cliente VARCHAR(20),
  razon_social_cliente VARCHAR(200),
  neto NUMERIC(14,2) DEFAULT 0,
  exento NUMERIC(14,2) DEFAULT 0,
  iva NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  cuenta_ingreso_id INTEGER,
  estado VARCHAR(50) DEFAULT 'vigente'::character varying,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  comprobante_id INTEGER,
  sii_tipo_doc VARCHAR(20),
  PRIMARY KEY (id),
  CONSTRAINT ventas_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES comprobantes (id),
  CONSTRAINT ventas_cuenta_ingreso_id_fkey FOREIGN KEY (cuenta_ingreso_id) REFERENCES plan_cuentas (id),
  CONSTRAINT ventas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------
-- liquidacion_detalle   (0 filas en producción)
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS liquidacion_detalle (
  id SERIAL NOT NULL,
  liquidacion_id INTEGER NOT NULL,
  concepto_id INTEGER,
  nombre VARCHAR(150) NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  monto NUMERIC(18,2) DEFAULT 0,
  imponible BOOLEAN DEFAULT false,
  tributable BOOLEAN DEFAULT false,
  PRIMARY KEY (id),
  CONSTRAINT liquidacion_detalle_concepto_id_fkey FOREIGN KEY (concepto_id) REFERENCES conceptos_remuneracion (id),
  CONSTRAINT liquidacion_detalle_liquidacion_id_fkey FOREIGN KEY (liquidacion_id) REFERENCES liquidaciones (id) ON DELETE CASCADE
);

-- ========================================================================
-- Índices
-- ========================================================================
CREATE INDEX IF NOT EXISTS idx_admin_audit_customer ON public.admin_audit_logs USING btree (customer_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_afp_parametros_empresa_periodo_nombre ON public.afp_parametros USING btree (empresa_id, periodo, nombre);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compras_sii_unicas ON public.compras USING btree (empresa_id, sii_tipo_doc, folio) WHERE ((folio IS NOT NULL) AND ((folio)::text <> ''::text));
CREATE UNIQUE INDEX IF NOT EXISTS comprobantes_empresa_id_tipo_numero_key ON public.comprobantes USING btree (empresa_id, tipo, numero);
CREATE INDEX IF NOT EXISTS idx_conciliacion_empresa_fecha ON public.conciliacion_bancaria_movimientos USING btree (empresa_id, fecha);
CREATE UNIQUE INDEX IF NOT EXISTS configuracion_contable_empresa_id_key ON public.configuracion_contable USING btree (empresa_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_rem_empresa_periodo ON public.configuracion_remuneraciones USING btree (empresa_id, periodo);
CREATE UNIQUE INDEX IF NOT EXISTS ejercicios_contables_empresa_id_anio_key ON public.ejercicios_contables USING btree (empresa_id, anio);
CREATE INDEX IF NOT EXISTS idx_honorarios_empresa_fecha ON public.honorarios USING btree (empresa_id, fecha_emision);
CREATE UNIQUE INDEX IF NOT EXISTS idx_honorarios_unicos ON public.honorarios USING btree (empresa_id, rut_prestador, folio) WHERE ((folio IS NOT NULL) AND ((folio)::text <> ''::text) AND ((estado)::text = 'vigente'::text));
CREATE INDEX IF NOT EXISTS idx_impuesto_unico_empresa_periodo ON public.impuesto_unico_tramos USING btree (empresa_id, periodo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_liquidaciones_empresa_trabajador_periodo ON public.liquidaciones USING btree (empresa_id, trabajador_id, periodo) WHERE ((estado)::text <> 'eliminada'::text);
CREATE INDEX IF NOT EXISTS idx_pagos_cobros_documento ON public.pagos_cobros USING btree (empresa_id, tipo_documento, documento_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cobros_empresa_fecha ON public.pagos_cobros USING btree (empresa_id, fecha);
CREATE UNIQUE INDEX IF NOT EXISTS pagos_mercadopago_external_reference_key ON public.pagos_mercadopago USING btree (external_reference);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_usuario ON public.password_reset_tokens USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_vigencia ON public.password_reset_tokens USING btree (token_hash, vence_en, usado_en);
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_token_hash_key ON public.password_reset_tokens USING btree (token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS plan_cuentas_empresa_id_codigo_key ON public.plan_cuentas USING btree (empresa_id, codigo);
CREATE UNIQUE INDEX IF NOT EXISTS remanente_iva_empresa_id_periodo_key ON public.remanente_iva USING btree (empresa_id, periodo);
CREATE INDEX IF NOT EXISTS idx_solicitudes_contacto_rut ON public.solicitudes_contacto USING btree (rut_normalizado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_contacto_usuario ON public.solicitudes_contacto USING btree (usuario_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_user ON public.subscription_history USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_notifications_user ON public.subscription_notifications USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON public.subscription_payments USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_code_key ON public.subscription_plans USING btree (code);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON public.subscriptions USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajadores_empresa_rut ON public.trabajadores USING btree (empresa_id, rut) WHERE ((estado)::text <> 'eliminado'::text);
CREATE INDEX IF NOT EXISTS idx_usuarios_demo_email ON public.usuarios USING btree (email, demo_activo, demo_vence);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios USING btree (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_rut_normalizado_unico ON public.usuarios USING btree (rut_normalizado) WHERE ((rut_normalizado IS NOT NULL) AND ((rut_normalizado)::text <> ''::text));
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_key ON public.usuarios USING btree (email);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_empresa ON public.usuarios_empresas USING btree (empresa_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_usuario ON public.usuarios_empresas USING btree (usuario_id);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_empresas_usuario_id_empresa_id_key ON public.usuarios_empresas USING btree (usuario_id, empresa_id);
CREATE INDEX IF NOT EXISTS idx_vacaciones_ausencias_empresa_periodo ON public.vacaciones_ausencias USING btree (empresa_id, periodo);
CREATE INDEX IF NOT EXISTS idx_vacaciones_ausencias_trabajador ON public.vacaciones_ausencias USING btree (trabajador_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_sii_unicas ON public.ventas USING btree (empresa_id, sii_tipo_doc, folio) WHERE ((folio IS NOT NULL) AND ((folio)::text <> ''::text));

COMMIT;
