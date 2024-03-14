import { Link, useLocation} from "react-router-dom";
import { useState } from "react";
import BetNav from "./Bets/BetNav";



const Header = () => {
    const location = useLocation();
    
    const [display, setDisplay] = useState(false)
    const swapDisplay = () => {
        setDisplay((current) => !current)
    }

    return(
        <div className="flex justify-between">
            <Link className="ease-in no-underline text-black" to="Friendly-Betting/">
            <div className=" bg-spring-green-light box-shadow rounded-br-2xl p-4 pt-8 text-shadow flex justify-start items-center text-5xl">
                <span className="font-sans font-thin">FR</span>
                <span className="font-serif font-bold text-2xl">IE</span>
                <span className="font-sans font-thin">NDLY &nbsp;</span>
                <span>Bets</span>
            </div>
            </Link>
            {
                location.pathname === "/Friendly-Betting/Bet" ? (
                <div onClick={swapDisplay} className="bg-spring-green-light box-shadow rounded-b-2xl p-4 flex justify-center items-center">
                    <span className="">Create One!</span>
                    {display ? <BetNav swap={swapDisplay}/> : null}
                </div>
                ) : null
            }
            
            <Link className="flex box-shadow  bg-spring-green-light rounded-bl-2xl betLink p-8 pb-4 no-underline text-black" to="Friendly-Betting/Bet">View Bets</Link>
        </div>
    )
}

export default Header;