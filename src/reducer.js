
import { loadFromLocalStorage } from "./localStore";
export const initialState = {
  user: localStorage.getItem("user")
};

export const actionTypes = {
  SET_USER: "SET_USER"
};

const reducer = (state, action) => {
  console.log(action);

  switch (action.type) {
    case actionTypes.SET_USER:
      return {
        ...state,
        user: action.user
      };

    default:
      return state;
  }
};

export default reducer;
