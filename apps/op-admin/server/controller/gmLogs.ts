import { H3Event, getQuery } from 'h3';
import { queryGmOperationLogs } from '../model/gmOperationLogs';

export const listLogs = async (evt: H3Event) => {
  const q = getQuery(evt) as any;
  const page = q.page ? Number(q.page) : 1;
  const pageSize = q.pageSize ? Number(q.pageSize) : 20;
  const params = {
    page,
    pageSize,
    op_type: (q.op_type as any) || 'all',
    server: q.server as string | undefined,
    player_id: q.player_id as string | undefined,
    player_name: q.player_name as string | undefined,
    open_id: q.open_id as string | undefined,
    admin_id: q.admin_id as string | undefined,
    startDate: q.startDate as string | undefined,
    endDate: q.endDate as string | undefined
  };

  try {
    const { rows, total } = await queryGmOperationLogs(params);
    return { success: true, data: rows, total, page, pageSize };
  } catch (e: any) {
    return { success: false, message: e?.message || '查询失败', data: [], total: 0 };
  }
};


