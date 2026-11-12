// Cloud Functions da Orbe. Cada função vive na sua pasta:
//   schedules/     funções agendadas
//   financial/     regras financeiras (recorrência de compromissos)
//   notifications/ lembretes internos
//   lib/           Firebase Admin e utilitários de data
const { generateCommitmentOccurrences } = require('./schedules/generate-commitment-occurrences');

exports.generateCommitmentOccurrences = generateCommitmentOccurrences;
