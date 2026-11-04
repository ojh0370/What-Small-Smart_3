import { createContext, useContext } from "react";
import { useRosbridgeCore } from "../hooks/useRosbridge";

// 앱 전체에서 로봇(rosbridge) 연결을 "딱 한 번만" 만들고,
// 모든 화면이 그 연결을 같이 쓰게 해주는 파일이에요.
const RosbridgeContext = createContext(null);

export function RosbridgeProvider({ children }) {
  const ros = useRosbridgeCore(); // 연결은 여기서 한 번만 만들어져요
  return (
    <RosbridgeContext.Provider value={ros}>
      {children}
    </RosbridgeContext.Provider>
  );
}

// 각 화면에서는 예전처럼 useRosbridge()를 부르면 돼요.
// 이제는 새 연결을 만드는 대신, 위에서 만든 같은 연결을 돌려받아요.
export function useRosbridge() {
  const ros = useContext(RosbridgeContext);
  if (!ros) {
    throw new Error("useRosbridge는 <RosbridgeProvider> 안에서만 쓸 수 있어요.");
  }
  return ros;
}
