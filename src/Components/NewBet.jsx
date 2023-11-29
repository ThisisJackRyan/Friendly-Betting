import CreateNewBet from "./CreateNewBet";
import Players from "./Players";



const NewBet = () => {
    return (
        <div className="flex ">
            <div className="x2">
                <CreateNewBet />
            </div>
            <div className="x1">
                <Players />
            </div>
        </div>
    )
}

export default NewBet;