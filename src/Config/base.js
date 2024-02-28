
import { getAuth } from "firebase/auth";




// This function returns a dictionary of the user's information
export const getSignedInUserInfo = () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user !== null) {
        const userInfo = {
            uid: user.uid,
            email: user.email,
        }

        return userInfo;
    } else {
        return null;
    }
}


export function getCollectionName(betType) {
    if(betType === "Money Line"){
        return "MoneyLineBets"
    }
    else if(betType === "Over Under"){
        return "OverUnderBets"
    }
    else if(betType === "Prop"){
        return "PropBets"
    }
}

export function getBetType(collectionName) {
    if(collectionName === "MoneyLineBets"){
        return "Money Line"
    }
    else if(collectionName === "OverUnderBets"){
        return "Over Under"
    }
    else if(collectionName === "PropBets"){
        return "Prop"
    }
}