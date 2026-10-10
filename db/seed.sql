-- PULSE · datos iniciales: diagnóstico de clima (2 partes), punto de partida y empresa demo
-- Se ejecuta con: npm run db:migrar  (o: mysql -u root -p pulse < db/seed.sql)

SET NAMES utf8mb4;

INSERT IGNORE INTO cuestionarios (id, codigo, nombre, tipo, instrucciones) values
 ('00000000-0000-4000-a000-000000000c01', 'CLIMA1', 'Diagnóstico de clima · Parte 1: Liderazgo y comunicación', 'clima', 'Responde pensando en los últimos 3 meses. No hay respuestas correctas o incorrectas.'),
 ('00000000-0000-4000-a000-000000000c02', 'CLIMA2', 'Diagnóstico de clima · Parte 2: Reconocimiento y bienestar', 'clima', 'Responde pensando en los últimos 3 meses.'),
 ('00000000-0000-4000-a000-000000000b01', 'BASE', 'Punto de partida', 'base', 'Estas preguntas registran cómo inicias el programa. Las repetiremos al final para medir tu avance.');

INSERT IGNORE INTO reactivos (cuestionario_id, orden, tipo, texto, dimension) values
 ('00000000-0000-4000-a000-000000000c01', 1, 'likert', 'Mi jefe inmediato me da retroalimentación útil sobre mi trabajo.', 'Liderazgo'),
 ('00000000-0000-4000-a000-000000000c01', 2, 'likert', 'Confío en las decisiones de la dirección de la empresa.', 'Liderazgo'),
 ('00000000-0000-4000-a000-000000000c01', 3, 'likert', 'Mi jefe está disponible cuando necesito apoyo.', 'Liderazgo'),
 ('00000000-0000-4000-a000-000000000c01', 4, 'likert', 'Recibo a tiempo la información que necesito para hacer mi trabajo.', 'Comunicación'),
 ('00000000-0000-4000-a000-000000000c01', 5, 'likert', 'Puedo expresar mis ideas sin temor a represalias.', 'Comunicación'),
 ('00000000-0000-4000-a000-000000000c01', 6, 'likert', 'Entre áreas compartimos información de forma oportuna.', 'Comunicación'),
 ('00000000-0000-4000-a000-000000000c01', 7, 'likert', 'Mi equipo colabora para lograr los objetivos.', 'Trabajo en equipo'),
 ('00000000-0000-4000-a000-000000000c01', 8, 'likert', 'Cuando hay un problema, mis compañeros me apoyan.', 'Trabajo en equipo'),
 ('00000000-0000-4000-a000-000000000c01', 9, 'abierta', '¿Qué cambiarías primero para mejorar la comunicación en tu área?', 'Comunicación'),
 ('00000000-0000-4000-a000-000000000c02', 1, 'likert', 'Se reconoce cuando hago bien mi trabajo.', 'Reconocimiento'),
 ('00000000-0000-4000-a000-000000000c02', 2, 'likert', 'Mi salario y prestaciones son justos para lo que aporto.', 'Reconocimiento'),
 ('00000000-0000-4000-a000-000000000c02', 3, 'likert', 'Tengo oportunidades reales de crecer en la empresa.', 'Reconocimiento'),
 ('00000000-0000-4000-a000-000000000c02', 4, 'likert', 'Mi carga de trabajo me permite terminar mi jornada a tiempo.', 'Carga de trabajo'),
 ('00000000-0000-4000-a000-000000000c02', 5, 'likert', 'Puedo equilibrar mi vida personal y laboral.', 'Bienestar'),
 ('00000000-0000-4000-a000-000000000c02', 6, 'likert', 'Termino la semana con energía suficiente.', 'Bienestar'),
 ('00000000-0000-4000-a000-000000000c02', 7, 'likert', 'Me siento orgulloso(a) de trabajar aquí.', 'Orgullo y pertenencia'),
 ('00000000-0000-4000-a000-000000000c02', 8, 'likert', 'Recomendaría esta empresa como un buen lugar para trabajar.', 'Orgullo y pertenencia'),
 ('00000000-0000-4000-a000-000000000c02', 9, 'abierta', '¿Qué es lo que más valoras de trabajar aquí?', 'Orgullo y pertenencia'),
 ('00000000-0000-4000-a000-000000000b01', 1, 'likert', 'Conozco los estándares de mi puesto.', 'Orgullo y pertenencia'),
 ('00000000-0000-4000-a000-000000000b01', 2, 'likert', 'Cuando detecto un error, sé a quién avisar y cómo.', 'Comunicación'),
 ('00000000-0000-4000-a000-000000000b01', 3, 'likert', 'Siento que mi trabajo influye en la experiencia del cliente.', 'Orgullo y pertenencia'),
 ('00000000-0000-4000-a000-000000000b01', 4, 'abierta', '¿Qué esperas lograr con este programa?', NULL);

-- Empresa de demostración con logo de muestra (reemplazar por el cliente real desde la consola)
INSERT IGNORE INTO empresas (id, nombre, sigla, color, logo_url, codigo, contacto, estado)
values ('00000000-0000-4000-a000-0000000000e1', 'Grupo Altavista (demo)', 'GA', '#1F6F78', '/logos/altavista-demo.svg', 'ALTA-2026', 'Recursos Humanos', 'Diagnóstico en aplicación');

INSERT IGNORE INTO areas (empresa_id, nombre, responsable) values
 ('00000000-0000-4000-a000-0000000000e1', 'Operaciones', ''),
 ('00000000-0000-4000-a000-0000000000e1', 'Ventas', ''),
 ('00000000-0000-4000-a000-0000000000e1', 'Finanzas', ''),
 ('00000000-0000-4000-a000-0000000000e1', 'Recursos Humanos', ''),
 ('00000000-0000-4000-a000-0000000000e1', 'Tecnología', '');

INSERT IGNORE INTO empresa_diagnostico (empresa_id, cuestionario_id, orden) values
 ('00000000-0000-4000-a000-0000000000e1', '00000000-0000-4000-a000-000000000c01', 1),
 ('00000000-0000-4000-a000-0000000000e1', '00000000-0000-4000-a000-000000000c02', 2);
