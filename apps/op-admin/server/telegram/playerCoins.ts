import { findByUserId } from '../model/gameCharacters';
import { grantToPlayerFromAdmin, PlayerCoinTransferError as PlayerCoinError } from '../model/platformCoins';
import { findExactAccountMatches } from '../model/user';

export { PlayerCoinError };
export { MAX_PLATFORM_COIN_GRANT } from '../model/platformCoins';

export type PlayerForPlatformCoinGrant = {
    userId: number;
    account: string;
    thirdpartyUid: string;
    channelCode: string;
    gameCode: string;
    balance: number;
    roles: {
        roleId: string;
        roleName: string;
        serverId: number | null;
        serverName: string;
    }[];
};

export async function findPlayerForPlatformCoinGrant(account: string): Promise<PlayerForPlatformCoinGrant> {
    const identifier = account.trim();
    if (!identifier || [...identifier].length > 100) throw new PlayerCoinError('请输入有效的玩家账号或第三方 UID');

    const accounts = await findExactAccountMatches(identifier);
    if (accounts.length === 0) throw new PlayerCoinError('找不到完全匹配的玩家账号');
    if (accounts.length !== 1) throw new PlayerCoinError('账号或 UID 匹配到多个玩家，请使用唯一的账号或 UID');

    const user = accounts[0];
    if ((user.status ?? 0) !== 0) throw new PlayerCoinError('该玩家账号已禁用');

    const characters = await findByUserId(user.id);
    const roles = characters.map(character => ({
        roleId: character.uuid,
        roleName: character.character_name,
        serverId: character.server_id ?? null,
        serverName: character.server_name,
    }));

    return {
        userId: user.id,
        account: user.username || user.thirdparty_uid,
        thirdpartyUid: user.thirdparty_uid,
        channelCode: user.channel_code || '',
        gameCode: user.game_code || '',
        balance: Number(user.platform_coins) || 0,
        roles,
    };
}

export async function grantPlayerPlatformCoins({ adminId, player, amount, requestId }: {
    adminId: number;
    player: Pick<PlayerForPlatformCoinGrant, 'userId' | 'account' | 'thirdpartyUid'>;
    amount: number;
    requestId: string;
}) {
    return grantToPlayerFromAdmin({
        adminId, userId: player.userId, account: player.account, thirdpartyUid: player.thirdpartyUid, amount, requestId,
    });
}
