-- PULSE · reglas de negocio que viven en la base de datos.
-- Cada sentencia termina con // al final de la línea (las ejecuta npm run db:migrar).

DROP TRIGGER IF EXISTS max_reactivos//
CREATE TRIGGER max_reactivos BEFORE INSERT ON reactivos FOR EACH ROW
IF (SELECT COUNT(*) FROM reactivos WHERE cuestionario_id = NEW.cuestionario_id) >= 20 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Un cuestionario admite máximo 20 reactivos';
END IF//

DROP TRIGGER IF EXISTS max_diagnostico//
CREATE TRIGGER max_diagnostico BEFORE INSERT ON empresa_diagnostico FOR EACH ROW
IF (SELECT COUNT(*) FROM empresa_diagnostico WHERE empresa_id = NEW.empresa_id) >= 4 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El diagnóstico admite de 1 a 4 cuestionarios';
END IF//
