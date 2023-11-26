import { Link } from "react-router-dom";



const Header = () => {
    return(
        <div className="header">
            <div className="x1">
                <div className="logo">logo</div>
            </div>
            <div className="x1">Title of website</div>
            <div className="flex pages x1">
                <Link to="/SignIn">signIn</Link>
                <Link to="/NewBet">Create New Bet</Link>
                {//<button onClick={props.newBet}>Create New Bet</button>
                }
            </div>
        </div>
    )
}

export default Header;