import { Outlet, Link } from "react-router-dom";


const Header = () => {
    return(
        <div className="header">
            <div className="x1">
                <div className="logo">logo</div>
            </div>
            <div className="x1">Title of website</div>
            <div className="flex pages x1">
                <div>other pages</div>
                <Link to="/NewBet">Create New Bet</Link>
                {//<button onClick={props.newBet}>Create New Bet</button>
                }
            </div>
            <Outlet/>
        </div>
    )
}

export default Header;