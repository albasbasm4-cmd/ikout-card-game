/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from "react";

export interface PlayerPingInfo {
  seatIndex: number;
  name: string;
  pingMs: number;
  isHost?: boolean;
}

export interface NetworkLatencyState {
  isHotspotActive: boolean;
  roomCode?: string;
  mySeatIndex: number;
  playersPing: Record<number, number>; // seatIndex -> pingMs
  setHotspotActive: (active: boolean, roomCode?: string, mySeat?: number) => void;
  updatePlayerPing: (seatIndex: number, pingMs: number) => void;
  resetLatency: () => void;
}

const NetworkLatencyContext = createContext<NetworkLatencyState>({
  isHotspotActive: false,
  roomCode: undefined,
  mySeatIndex: 0,
  playersPing: {},
  setHotspotActive: () => {},
  updatePlayerPing: () => {},
  resetLatency: () => {},
});

export const NetworkLatencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isHotspotActive, setIsHotspotActive] = useState<boolean>(false);
  const [roomCode, setRoomCode] = useState<string | undefined>(undefined);
  const [mySeatIndex, setMySeatIndex] = useState<number>(0);
  const [playersPing, setPlayersPing] = useState<Record<number, number>>({});

  const setHotspotActive = (active: boolean, code?: string, mySeat = 0) => {
    setIsHotspotActive(active);
    setRoomCode(code);
    setMySeatIndex(mySeat);
    if (!active) {
      setPlayersPing({});
    }
  };

  const updatePlayerPing = (seatIndex: number, pingMs: number) => {
    setPlayersPing((prev) => ({
      ...prev,
      [seatIndex]: Math.max(0, Math.round(pingMs)),
    }));
  };

  const resetLatency = () => {
    setIsHotspotActive(false);
    setRoomCode(undefined);
    setPlayersPing({});
  };

  return (
    <NetworkLatencyContext.Provider
      value={{
        isHotspotActive,
        roomCode,
        mySeatIndex,
        playersPing,
        setHotspotActive,
        updatePlayerPing,
        resetLatency,
      }}
    >
      {children}
    </NetworkLatencyContext.Provider>
  );
};

export const useNetworkLatency = () => useContext(NetworkLatencyContext);
