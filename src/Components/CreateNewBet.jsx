


const CreateNewBet = () => {
    return (
        <div className="CreateNewBet">
                <div className="flex name">
                    <div className="nameLabel">Name: </div>
                    <textarea className="nameInput" placeholder="How many times will grandpa bring up politics this Thanksgiving"></textarea>
                </div>
                <div className="range">
                    <div className="rangeLabel">
                        Range:
                    </div>
                    <div className="rangeLabel">
                    <span>Lower Bound</span>
                        <input type="text" />
                    </div>
                    <div className="rangeLabel">
                        <span>Upper Bound</span>
                        <input type="text" />
                    </div>
                </div>
        </div>
    )
}

export default CreateNewBet;