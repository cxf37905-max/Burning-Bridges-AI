import { falUnsentSubmissionSchema, type FalUnsentSubmission } from './fal-contract';

export class FalSubmissionNotSentError extends Error {
  readonly proof: FalUnsentSubmission;

  constructor(proof: FalUnsentSubmission) {
    super('The generation submission could not establish a connection after three attempts.');
    this.proof = falUnsentSubmissionSchema.parse(proof);
  }
}

function connectionCodes(reason: unknown): string[] | null {
  if (reason instanceof AggregateError) {
    const groups = reason.errors.map(connectionCodes);
    return groups.length && groups.every((group) => group !== null)
      ? groups.flatMap((group) => group!)
      : null;
  }
  if (!(reason instanceof Error) || !('code' in reason)) return null;
  const code = reason.code;
  return typeof code === 'string' && [
    'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT',
  ].includes(code) ? [code] : null;
}

export function unsentConnectionCodes(reason: unknown) {
  // Node fetch通过TypeError.cause暴露连接阶段错误；未知错误一律不能推断未发送。
  return reason instanceof TypeError ? connectionCodes(reason.cause) : null;
}
