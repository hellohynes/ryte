import { localhostApprovalsFilePath } from '../paths'
import { createApprovals } from './approvals'

/** The one list of always-allowed local addresses. The workspace reads it on load; the handlers change it. */
export const approvals = createApprovals(localhostApprovalsFilePath)
