
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